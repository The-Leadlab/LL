from typing import List
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.orm import Session
from app.models.user import User
from app.models.lead import Lead
from app.api.deps import get_db, get_current_user
from app.services.ml_service import MLService
from app.core.logger import logger

router = APIRouter(redirect_slashes=False)

# Model instance
predictor = MLService()

def check_admin_access(current_user: User = Depends(get_current_user)):
    """Admin yetkisini kontrol et"""
    if not current_user.is_superuser:
        raise HTTPException(
            status_code=403,
            detail="Bu endpoint'e erişim için admin yetkisi gereklidir"
        )
    return current_user

@router.post("/predict/{lead_id}")
def predict_lead(
    lead_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Make personality prediction for lead"""
    try:
        # Lead'i kontrol et
        lead = db.query(Lead).filter(Lead.id == lead_id).first()
        if not lead:
            raise HTTPException(status_code=404, detail="Lead bulunamadı")
            
        # Lead verilerini hazırla
        lead_data = {
            'sector': lead.sector,
            'job_title': lead.job_title,
            'location': lead.location,
            'linkedin': lead.linkedin,
            'email': lead.email,
            'mobile': lead.mobile
        }
        
        # Tahmin yap
        prediction = predictor.predict(lead_data)
        
        # Lead'i güncelle (notes field varsa)
        if hasattr(lead, 'notes'):
            lead.notes = f"{lead.notes}\n\nML Prediction: {prediction}" if lead.notes else f"ML Prediction: {prediction}"
            db.commit()
        
        return prediction
        
    except Exception as e:
        logger.error(f"Error predicting lead {lead_id}: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Tahmin yapılırken hata oluştu: {str(e)}"
        )

@router.post("/batch-predict")
def batch_predict(
    lead_ids: List[int],
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Make personality predictions for multiple leads"""
    try:
        # Lead'leri kontrol et
        leads = db.query(Lead).filter(Lead.id.in_(lead_ids)).all()
        if not leads:
            raise HTTPException(status_code=404, detail="Hiç lead bulunamadı")
            
        # Lead verilerini hazırla ve arka planda işle
        def process_predictions():
            for lead in leads:
                lead_data = {
                    'sector': lead.sector,
                    'job_title': lead.job_title,
                    'location': lead.location,
                    'linkedin': lead.linkedin,
                    'email': lead.email,
                    'mobile': lead.mobile
                }
                
                try:
                    prediction = predictor.predict(lead_data)
                    if hasattr(lead, 'notes'):
                        lead.notes = f"{lead.notes}\n\nML Prediction: {prediction}" if lead.notes else f"ML Prediction: {prediction}"
                        db.commit()
                except Exception as e:
                    logger.error(f"Error predicting lead {lead.id}: {str(e)}")
                    continue
        
        background_tasks.add_task(process_predictions)
        return {"message": "Batch prediction started", "lead_count": len(leads)}
            
    except Exception as e:
        logger.error(f"Error in batch prediction: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Toplu tahmin yapılırken hata oluştu: {str(e)}"
        )

@router.get("/metrics")
def get_performance_metrics(
    current_user: User = Depends(check_admin_access),
    db: Session = Depends(get_db)
):
    """Model performans metriklerini getir (Sadece Admin)"""
    try:
        metrics = predictor.get_metrics()
        return metrics
    except Exception as e:
        logger.error(f"Error getting metrics: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Metrikler alınırken hata oluştu: {str(e)}"
        )

@router.post("/retrain")
def retrain_model(
    background_tasks: BackgroundTasks,
    current_user: User = Depends(check_admin_access),
    db: Session = Depends(get_db)
):
    """Model'i yeniden eğit (Sadece Admin)"""
    try:
        def train_model():
            try:
                predictor.retrain()
                logger.info("Model retraining completed successfully")
            except Exception as e:
                logger.error(f"Model retraining failed: {str(e)}")
        
        background_tasks.add_task(train_model)
        return {"message": "Model retraining started"}
    except Exception as e:
        logger.error(f"Error starting model retraining: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Model eğitimi başlatılırken hata oluştu: {str(e)}"
        )
