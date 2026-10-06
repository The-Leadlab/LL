from typing import Dict, List, Any, TYPE_CHECKING
from datetime import datetime
import re

if TYPE_CHECKING:
    from sklearn.pipeline import Pipeline
    import pandas as pd


def extract_features_from_lead(lead: Any) -> Dict[str, Any]:
    """Extract features from real Lead model"""
    features = {}
    
    # Temel demografik özellikler
    features.update({
        'has_first_name': 1 if lead.first_name else 0,
        'has_last_name': 1 if lead.last_name else 0,
        'has_email': 1 if lead.email else 0,
        'has_job_title': 1 if lead.job_title else 0,
        'has_company': 1 if lead.company else 0,
        'has_website': 1 if lead.website else 0,
        'has_linkedin': 1 if lead.linkedin else 0,
        'has_telephone': 1 if lead.telephone else 0,
        'has_mobile': 1 if lead.mobile else 0,
        'has_location': 1 if lead.location else 0,
    })
    
    # Coğrafi özellikler
    features.update({
        'country': lead.country or 'unknown',
        'location': lead.location or 'unknown',
    })
    
    # Sektör ve meslek özellikleri
    features.update({
        'sector': lead.sector or 'unknown',
        'job_title': lead.job_title or 'unknown',
        'company': lead.company or 'unknown',
    })
    
    # WPI (Wealth Performance Index) özellikleri
    features.update({
        'wpi': lead.wpi or 'unknown',
        'has_wpi': 1 if lead.wpi else 0,
    })
    
    # Kaynak özellikleri
    features.update({
        'source': lead.source or 'unknown',
    })
    
    # Zamansal özellikler
    if lead.created_at:
        created_dt = lead.created_at
        now = datetime.now()
        days_since_creation = (now - created_dt).days
        
        features.update({
            'created_hour': created_dt.hour,
            'created_day': created_dt.day,
            'created_month': created_dt.month,
            'created_weekday': created_dt.weekday(),
            'days_since_creation': days_since_creation,
            'is_recent': 1 if days_since_creation <= 7 else 0,
            'is_old': 1 if days_since_creation > 90 else 0,
        })
    
            # Lead quality indicators
    features.update({
        'profile_completeness': calculate_profile_completeness(lead),
        'linkedin_quality': assess_linkedin_quality(lead.linkedin) if lead.linkedin else 0,
        'email_quality': assess_email_quality(lead.email) if lead.email else 0,
        'company_quality': assess_company_quality(lead.company, lead.website) if lead.company else 0,
    })
    
    # Sektör bazlı özellikler
    features.update({
        'is_tech_sector': 1 if is_tech_sector(lead.sector) else 0,
        'is_finance_sector': 1 if is_finance_sector(lead.sector) else 0,
        'is_design_sector': 1 if is_design_sector(lead.sector) else 0,
    })
    
    # Job title bazlı özellikler
    features.update({
        'seniority_level': assess_seniority_level(lead.job_title) if lead.job_title else 0,
        'is_decision_maker': 1 if is_decision_maker(lead.job_title) else 0,
        'is_technical_role': 1 if is_technical_role(lead.job_title) else 0,
    })
    
    # Psychometrics verisi varsa
    if lead.psychometrics and lead.psychometrics != 'null':
        features.update(extract_psychometric_features(lead.psychometrics))
    else:
        features.update({
            'has_psychometrics': 0,
            'personality_type': 'unknown',
            'communication_style': 'unknown',
            'decision_making': 'unknown',
            'leadership_style': 'unknown'
        })
    
    return features

def calculate_profile_completeness(lead) -> float:
    """Lead profilinin ne kadar eksiksiz olduğunu hesapla (0-1 arası)"""
    fields = [
        lead.first_name, lead.last_name, lead.email, lead.job_title,
        lead.company, lead.linkedin, lead.location, lead.country,
        lead.website, lead.sector, lead.telephone or lead.mobile
    ]
    
    filled_fields = sum(1 for field in fields if field)
    return filled_fields / len(fields)

def assess_linkedin_quality(linkedin_url: str) -> int:
    """Evaluate LinkedIn URL quality (0-10)"""
    if not linkedin_url:
        return 0
    
    score = 0
    # Geçerli LinkedIn URL'i
    if 'linkedin.com/in/' in linkedin_url:
        score += 5
    
    # Tam profil URL'i (uzunluk kontrolü)
    if len(linkedin_url) > 50:
        score += 3
    
    # HTTPS kontrolü
    if linkedin_url.startswith('https://'):
        score += 2
    
    return min(score, 10)

def assess_email_quality(email: str) -> int:
    """Evaluate email quality (0-10)"""
    if not email:
        return 0
    
    score = 0
    
    # Geçerli email formatı
    if re.match(r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$', email):
        score += 5
    
    # Kurumsal email (gmail, yahoo değil)
    if not any(domain in email.lower() for domain in ['gmail', 'yahoo', 'hotmail', 'outlook']):
        score += 3
    
    # Profesyonel format (ad.soyad gibi)
    if '.' in email.split('@')[0]:
        score += 2
    
    return min(score, 10)

def assess_company_quality(company: str, website: str = None) -> int:
    """Evaluate company quality (0-10)"""
    if not company:
        return 0
    
    score = 0
    
    # Şirket adı uzunluğu
    if len(company) > 5:
        score += 3
    
    # Website varsa
    if website and website.startswith('http'):
        score += 4
    
    # Büyük harflerle yazılmış (profesyonel görünüm)
    if company[0].isupper():
        score += 1
    
    # "Inc", "Ltd", "Corp" gibi kurumsal ekleri
    if any(suffix in company.upper() for suffix in ['INC', 'LTD', 'CORP', 'LLC', 'GROUP', 'COMPANY']):
        score += 2
    
    return min(score, 10)

def is_tech_sector(sector: str) -> bool:
    """Teknoloji sektörü kontrolü"""
    if not sector:
        return False
    
    tech_keywords = ['technology', 'software', 'tech', 'digital', 'it ', 'computer', 'cyber']
    return any(keyword in sector.lower() for keyword in tech_keywords)

def is_finance_sector(sector: str) -> bool:
    """Finans sektörü kontrolü"""
    if not sector:
        return False
    
    finance_keywords = ['finance', 'banking', 'investment', 'wealth', 'asset', 'capital', 'fund']
    return any(keyword in sector.lower() for keyword in finance_keywords)

def is_design_sector(sector: str) -> bool:
    """Tasarım sektörü kontrolü"""
    if not sector:
        return False
    
    design_keywords = ['design', 'architecture', 'creative', 'art', 'interior', 'graphic']
    return any(keyword in sector.lower() for keyword in design_keywords)

def assess_seniority_level(job_title: str) -> int:
    """İş pozisyonu kıdemini değerlendi (0-10)"""
    if not job_title:
        return 0
    
    title = job_title.lower()
    
    # C-level
    if any(word in title for word in ['ceo', 'cto', 'cfo', 'coo', 'chief']):
        return 10
    
    # Director level
    if any(word in title for word in ['director', 'president', 'vp', 'vice president']):
        return 8
    
    # Manager level
    if any(word in title for word in ['manager', 'head of', 'lead', 'principal']):
        return 6
    
    # Senior level
    if any(word in title for word in ['senior', 'sr']):
        return 4
    
    # Junior/Entry level
    if any(word in title for word in ['junior', 'jr', 'associate', 'assistant']):
        return 2
    
    return 3  # Default for unclear titles

def is_decision_maker(job_title: str) -> bool:
    """Karar verici pozisyonda mı kontrolü"""
    if not job_title:
        return False
    
    title = job_title.lower()
    decision_keywords = [
        'ceo', 'cto', 'cfo', 'coo', 'chief', 'director', 'president', 
        'vp', 'vice president', 'founder', 'owner', 'managing', 'head of'
    ]
    return any(keyword in title for keyword in decision_keywords)

def is_technical_role(job_title: str) -> bool:
    """Teknik pozisyon kontrolü"""
    if not job_title:
        return False
    
    title = job_title.lower()
    tech_keywords = [
        'engineer', 'developer', 'programmer', 'architect', 'analyst',
        'specialist', 'consultant', 'technical', 'it ', 'software'
    ]
    return any(keyword in title for keyword in tech_keywords)

def extract_psychometric_features(psychometrics_data: str) -> Dict[str, Any]:
    """Psychometrics JSON verisinden özellikleri çıkar"""
    try:
        import json
        if psychometrics_data and psychometrics_data != 'null':
            data = json.loads(psychometrics_data)
            return {
                'has_psychometrics': 1,
                'personality_type': data.get('personality_type', 'unknown'),
                'communication_style': data.get('communication_style', 'unknown'),
                'decision_making': data.get('decision_making', 'unknown'),
                'leadership_style': data.get('leadership_style', 'unknown')
            }
    except:
        pass
    
    return {
        'has_psychometrics': 0,
        'personality_type': 'unknown',
        'communication_style': 'unknown',
        'decision_making': 'unknown',
        'leadership_style': 'unknown'
    }

# Eski fonksiyonu muhafaza et
def extract_features(lead_data: Dict[str, Any]) -> Dict[str, Any]:
    """Eski API uyumluluğu için"""
    # Bu fonksiyon artık dict input alıyor, lead modeli değil
    features = {}
    
    # Temel özellikler
    features.update({
        'company_size': lead_data.get('company_size', 0),
        'industry': lead_data.get('industry', 'unknown'),
        'country': lead_data.get('country', 'unknown'),
        'source': lead_data.get('source', 'unknown'),
        'has_website': 1 if lead_data.get('website') else 0,
        'has_phone': 1 if lead_data.get('phone') else 0,
        'has_linkedin': 1 if lead_data.get('linkedin_url') else 0
    })
    
    # Zamansal özellikler
    if created_at := lead_data.get('created_at'):
        created_dt = datetime.fromisoformat(created_at)
        features.update({
            'created_hour': created_dt.hour,
            'created_day': created_dt.day,
            'created_month': created_dt.month,
            'created_weekday': created_dt.weekday()
        })
    
    # Etkileşim özellikleri
    features.update({
        'email_interaction_count': lead_data.get('email_interaction_count', 0),
        'website_interaction_count': lead_data.get('website_interaction_count', 0),
        'total_interaction_count': lead_data.get('total_interaction_count', 0),
        'last_interaction_days': lead_data.get('last_interaction_days', -1)
    })
    
    # Psychometric özellikler
    if psychometric := lead_data.get('psychometric_data', {}):
        features.update({
            'personality_type': psychometric.get('personality_type', 'unknown'),
            'communication_style': psychometric.get('communication_style', 'unknown'),
            'decision_making': psychometric.get('decision_making', 'unknown'),
            'leadership_style': psychometric.get('leadership_style', 'unknown')
        })
    
    return features

def preprocess_features(features: Dict[str, Any]) -> "pd.DataFrame":
    """Feature'ları ön işlemden geçir"""
    import pandas as pd

    df = pd.DataFrame([features])
    
    # Kategorik kolonları dönüştür
    categorical_cols = ['country', 'location', 'sector', 'job_title', 'company', 'source', 'wpi',
                       'personality_type', 'communication_style', 'decision_making', 'leadership_style']
    
    for col in categorical_cols:
        if col in df.columns:
            df[col] = df[col].fillna('unknown')
            df[col] = df[col].astype('category')
    
    # Sayısal kolonları dönüştür
    numeric_cols = ['profile_completeness', 'linkedin_quality', 'email_quality', 'company_quality',
                   'seniority_level', 'days_since_creation', 'created_hour', 'created_day', 
                   'created_month', 'created_weekday']
    
    for col in numeric_cols:
        if col in df.columns:
            df[col] = df[col].fillna(0)
            df[col] = df[col].astype(float)
    
    # Binary kolonları dönüştür
    binary_cols = ['has_first_name', 'has_last_name', 'has_email', 'has_job_title', 'has_company',
                  'has_website', 'has_linkedin', 'has_telephone', 'has_mobile', 'has_location',
                  'has_wpi', 'has_psychometrics', 'is_recent', 'is_old', 'is_tech_sector',
                  'is_finance_sector', 'is_design_sector', 'is_decision_maker', 'is_technical_role']
    
    for col in binary_cols:
        if col in df.columns:
            df[col] = df[col].fillna(0)
            df[col] = df[col].astype(int)
    
    return df

def create_feature_importance(model: "Pipeline",
                            feature_names: List[str]) -> Dict[str, float]:
    """Model feature importance değerlerini hesapla"""
    if not hasattr(model, 'named_steps') or \
       'classifier' not in model.named_steps:
        return {}
    
    classifier = model.named_steps['classifier']
    importance = classifier.feature_importances_
    
    return dict(zip(feature_names,
                   [float(imp) for imp in importance]))
