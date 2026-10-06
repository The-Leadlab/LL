import logging
from typing import Dict, Any, List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, BackgroundTasks
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.lead import Lead
from app.models.user import User
from app.core.dependencies import get_current_user
from app.services import crystal_service, enhanced_personality_service
from app.services.internal_psychometric_analyzer import InternalPsychometricAnalyzer
from app.crud.crud_lead import lead as crud_lead
from app.crud.crud_ai_insights import ai_insights as crud_ai_insights
from app.services.free_ai_service import free_ai_service
from app.schemas.ai_insights import AIInsightsResponse, LeadScoreResponse, PersonalityResponse, RecommendationsResponse
from app.services.crystal_service import crystal_service
# from app.ml.psychometric_analysis import PsychometricAnalyzer  # Not needed, using internal analyzer
from app.services.enhanced_personality_service import enhanced_personality_service

logger = logging.getLogger(__name__)

router = APIRouter()

@router.get("/{lead_id}/insights", response_model=AIInsightsResponse)
async def get_lead_ai_insights(
    lead_id: int,
    refresh: bool = False,  # Force re-analysis
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get AI insights for lead - with free AI"""
    
    # Get lead
    lead = crud_lead.get(db, id=lead_id)
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    
    # Organization check - only check if not admin
    if not current_user.is_superuser and lead.organization_id != current_user.organization_id:
        raise HTTPException(status_code=403, detail="Not enough permissions")
    
    try:
        # First check for existing analysis in database
        if not refresh:
            existing_insight = crud_ai_insights.get_by_lead_id(
                db, 
                lead_id=lead_id, 
                organization_id=current_user.organization_id
            )
            
            if existing_insight:
                logger.info(f"Returning cached AI insights for lead {lead_id}")
                return format_ai_insights_response(existing_insight, lead_id)
        
        # Perform new analysis
        logger.info(f"Generating new AI insights for lead {lead_id}")
        
        # Lead verilerinden feature'ları çıkar (lazy import — avoid sklearn/pandas at boot)
        from app.ml.features import extract_features_from_lead
        features = extract_features_from_lead(lead)
        
        # Lead data hazırla
        lead_data = {
            "job_title": lead.job_title or "",
            "company": lead.company or "",
            "industry": getattr(lead, 'industry', '') or "",
            "first_name": lead.first_name or "",
            "last_name": lead.last_name or "",
            "email": lead.email or ""
        }
        
        # Analyze with free AI service
        ai_analysis = await free_ai_service.analyze_lead_personality(lead_data)
        
        # Lead scoring hesapla
        lead_scores = calculate_lead_scores(features, ai_analysis)
        
        # Combine AI analysis with scoring
        combined_analysis = {
            **ai_analysis,
            "quality_score": lead_scores["quality"],
            "priority_score": lead_scores["priority"],
            "features_used": len(features)
        }
        
        # Database'e kaydet
        ai_insight = crud_ai_insights.create_or_update(
            db,
            lead_id=lead_id,
            user_id=current_user.id,
            organization_id=current_user.organization_id,
            analysis_data=combined_analysis
        )
        
        logger.info(f"AI insights saved for lead {lead_id} using provider: {ai_analysis.get('provider', 'unknown')}")
        
        return format_ai_insights_response(ai_insight, lead_id)
        
    except Exception as e:
        logger.error(f"Error generating AI insights for lead {lead_id}: {str(e)}")
        raise HTTPException(status_code=500, detail="Error generating AI insights")

@router.post("/batch-analyze")
async def batch_analyze_leads(
    lead_ids: list[int],
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Perform AI analysis for multiple leads (background task)"""
    
    if len(lead_ids) > 50:
        raise HTTPException(status_code=400, detail="Maximum 50 leads can be analyzed at once")
    
    # Background task'a ekle
    background_tasks.add_task(
        batch_analyze_leads_task, 
        lead_ids, 
        current_user.id, 
        current_user.organization_id,
        db
    )
    
    return {
        "success": True,
        "message": f"Batch analysis started for {len(lead_ids)} leads",
        "lead_count": len(lead_ids),
        "status": "processing"
    }

@router.get("/analytics")
async def get_ai_insights_analytics(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get AI insights analytics"""
    
    analytics = crud_ai_insights.get_analytics(
        db, 
        organization_id=current_user.organization_id
    )
    
    return {
        "success": True,
        "data": analytics
    }

@router.get("/high-priority")
async def get_high_priority_leads(
    min_score: float = 70.0,
    limit: int = 10,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get high priority leads"""
    
    high_priority = crud_ai_insights.get_high_priority_leads(
        db,
        organization_id=current_user.organization_id,
        min_priority_score=min_score,
        limit=limit
    )
    
    # Lead bilgileri ile birleştir
    results = []
    for insight in high_priority:
        lead = crud_lead.get(db, id=insight.lead_id)
        if lead:
            results.append({
                "lead_id": insight.lead_id,
                "lead_name": f"{lead.first_name} {lead.last_name}".strip(),
                "company": lead.company,
                "job_title": lead.job_title,
                "priority_score": insight.priority_score,
                "quality_score": insight.quality_score,
                "personality_type": insight.personality_type,
                "confidence": insight.confidence_score,
                "last_analyzed": insight.updated_at
            })
    
    return {
        "success": True,
        "data": results,
        "count": len(results)
    }

@router.get("/{lead_id}/psychometric")
async def get_psychometric_analysis(
    lead_id: int,
    use_crystal: bool = False,  # Artık Crystal kullanmıyoruz
    refresh: bool = False,
    db: Session = Depends(get_db)
):
    """
    Get comprehensive psychometric analysis for a lead using our internal system
    """
    try:
        # Lead'i getir
        lead = db.query(Lead).filter(Lead.id == lead_id).first()
        if not lead:
            raise HTTPException(status_code=404, detail="Lead not found")
        
        # Kendi psikometrik analiz sistemimizi çalıştır (database session ile)
        from app.services.internal_psychometric_analyzer import InternalPsychometricAnalyzer
        
        analyzer = InternalPsychometricAnalyzer()
        psychometric_data = analyzer.analyze_lead_comprehensive(lead, refresh=refresh, db=db)
        
        return {
            "success": True,
            "data": psychometric_data,
            "message": "Psychometric analysis completed successfully using internal AI system"
        }
        
    except Exception as e:
        logger.error(f"Error in psychometric analysis for lead {lead_id}: {str(e)}")
        return {
            "success": False,
            "data": None,
            "message": f"Failed to analyze lead psychometrics: {str(e)}"
        }

@router.get("/{lead_id}/behavioral-predictions")
async def get_behavioral_predictions(
    lead_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get detailed behavioral predictions for lead"""
    
    lead = crud_lead.get(db, id=lead_id)
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    
    if not current_user.is_superuser and lead.organization_id != current_user.organization_id:
        raise HTTPException(status_code=403, detail="Not enough permissions")
    
    try:
        # Get existing psychometric analysis
        existing_insight = crud_ai_insights.get_by_lead_id(
            db, 
            lead_id=lead_id, 
            organization_id=current_user.organization_id
        )
        
        if not existing_insight:
            # Generate basic analysis first
            await get_lead_ai_insights(lead_id, False, db, current_user)
            existing_insight = crud_ai_insights.get_by_lead_id(
                db, lead_id=lead_id, organization_id=current_user.organization_id
            )
        
        # Generate behavioral predictions
        predictions = _generate_behavioral_predictions(existing_insight)
        
        return {
            "success": True,
            "data": predictions
        }
        
    except Exception as e:
        logger.error(f"Error generating behavioral predictions for lead {lead_id}: {str(e)}")
        raise HTTPException(status_code=500, detail="Error generating behavioral predictions")

@router.get("/{lead_id}/communication-guide")
async def get_communication_guide(
    lead_id: int,
    context: str = "sales",  # sales, meeting, email, phone
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get personalized communication guide for lead"""
    
    lead = crud_lead.get(db, id=lead_id)
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    
    if not current_user.is_superuser and lead.organization_id != current_user.organization_id:
        raise HTTPException(status_code=403, detail="Not enough permissions")
    
    try:
        # Get psychometric data
        psychometric_data = await get_psychometric_analysis(
            lead_id, use_crystal=False, refresh=False, db=db
        )
        
        insights = psychometric_data['data']['combined_insights']
        
        # Generate context-specific communication guide
        guide = _generate_communication_guide(insights, context)
        
        return {
            "success": True,
            "data": guide
        }
        
    except Exception as e:
        logger.error(f"Error generating communication guide for lead {lead_id}: {str(e)}")
        raise HTTPException(status_code=500, detail="Error generating communication guide")

@router.post("/test-disc")
async def test_disc_analysis(
    job_title: str = "Software Engineer",
    company: str = "Tech Corp",
    industry: str = "Technology",
    first_name: str = "John"
):
    """Test DISC analysis with custom data"""
    try:
        analyzer = InternalPsychometricAnalyzer()
        
        # Create test lead data
        test_data = {
            'job_title': job_title,
            'company': company,
            'industry': industry,
            'first_name': first_name,
            'enhanced_linkedin': {}
        }
        
        # Run DISC analysis
        disc_scores = analyzer._analyze_disc_profile(test_data)
        personality_type = analyzer._determine_personality_type(disc_scores, {})
        
        return {
            "success": True,
            "data": {
                "input": test_data,
                "disc_scores": disc_scores,
                "personality_type": personality_type,
                "total": sum(disc_scores.values())
            }
        }
        
    except Exception as e:
        logger.error(f"Test DISC analysis error: {str(e)}")
        return {
            "success": False,
            "error": str(e)
        }

async def batch_analyze_leads_task(
    lead_ids: list[int], 
    user_id: int, 
    organization_id: int,
    db: Session
):
    """Background task for batch analysis"""
    
    successful = 0
    failed = 0
    
    for lead_id in lead_ids:
        try:
            lead = crud_lead.get(db, id=lead_id)
            if lead and lead.organization_id == organization_id:
                
                # Lead data hazırla
                lead_data = {
                    "job_title": lead.job_title or "",
                    "company": lead.company or "",
                    "industry": getattr(lead, 'industry', '') or ""
                }
                
                # AI analysis
                ai_analysis = await free_ai_service.analyze_lead_personality(lead_data)
                
                # Features ve scoring
                from app.ml.features import extract_features_from_lead
                features = extract_features_from_lead(lead)
                lead_scores = calculate_lead_scores(features, ai_analysis)
                
                combined_analysis = {
                    **ai_analysis,
                    "quality_score": lead_scores["quality"],
                    "priority_score": lead_scores["priority"],
                    "features_used": len(features)
                }
                
                # Database'e kaydet
                crud_ai_insights.create_or_update(
                    db,
                    lead_id=lead_id,
                    user_id=user_id,
                    organization_id=organization_id,
                    analysis_data=combined_analysis
                )
                
                successful += 1
                
        except Exception as e:
            logger.error(f"Error analyzing lead {lead_id}: {str(e)}")
            failed += 1
    
    logger.info(f"Batch analysis completed: {successful} successful, {failed} failed")

def calculate_lead_scores(features: Dict[str, Any], ai_analysis: Dict[str, Any]) -> Dict[str, float]:
    """Calculate lead scores - combine with AI analysis"""
    
    # Profile completeness based quality score
    profile_completeness = features.get('profile_completeness', 0)
    linkedin_quality = features.get('linkedin_quality', 0) / 10.0
    email_quality = features.get('email_quality', 0) / 10.0
    company_quality = features.get('company_quality', 0) / 10.0
    
    # Include AI confidence in quality score
    ai_confidence = ai_analysis.get('confidence', 0.5)
    
    # Calculate quality score (0-100)
    quality_score = (
        profile_completeness * 35 +
        linkedin_quality * 20 +
        email_quality * 15 +
        company_quality * 15 +
        ai_confidence * 15
    ) * 100
    
    # Seniority based priority score
    seniority_level = features.get('seniority_level', 0) / 10.0
    is_decision_maker = features.get('is_decision_maker', 0)
    has_psychometrics = features.get('has_psychometrics', 0)
    is_recent = features.get('is_recent', 0)
    
    # Increase priority based on AI personality type
    personality_boost = 0
    if ai_analysis.get('personality_type') in ['D', 'I']:  # Directive/Influential = higher priority
        personality_boost = 0.1
    
    # Calculate priority score (0-100)
    priority_score = (
        seniority_level * 35 +
        is_decision_maker * 25 +
        has_psychometrics * 15 +
        is_recent * 15 +
        personality_boost * 10
    ) * 100
    
    return {
        "quality": min(max(quality_score, 0), 100),
        "priority": min(max(priority_score, 0), 100),
        "confidence": ai_confidence
    }

def format_ai_insights_response(ai_insight: Any, lead_id: int) -> AIInsightsResponse:
    """AI insight'ı API response formatına çevir"""
    
    return AIInsightsResponse(
        lead_id=lead_id,
        lead_score=LeadScoreResponse(
            quality=ai_insight.quality_score,
            priority=ai_insight.priority_score,
            confidence=ai_insight.confidence_score
        ),
        personality=PersonalityResponse(
            type=ai_insight.personality_type or "Unknown",
            strengths=ai_insight.strengths or [],
            communication=[ai_insight.communication_style] if ai_insight.communication_style else ["Professional"],
            confidence=ai_insight.confidence_score
        ),
        recommendations=RecommendationsResponse(
            approach=ai_insight.sales_approach or "Professional approach",
            tips=[
                "Maintain professional communication",
                "Focus on value proposition", 
                "Build trust through consistent follow-up"
            ],
            challenges=[
                "Understand their decision-making process",
                "Identify key stakeholders",
                "Present compelling ROI"
            ]
        ),
        features_used=ai_insight.features_used,
        confidence_score=ai_insight.confidence_score
    )

def _combine_psychometric_insights(crystal_data: Dict, internal_data: Dict) -> Dict[str, Any]:
    """Combine Crystal Knows and internal analysis data"""
    
    return {
        'personality_type': crystal_data.get('personality_type', internal_data.get('disc_profile', 'D')),
        'personality_description': crystal_data.get('personality_description', ''),
        'disc_scores': crystal_data.get('disc_scores', internal_data.get('disc_scores', {})),
        'big_five': crystal_data.get('big_five', {}),
        'communication_style': {
            **crystal_data.get('communication_style', {}),
            'internal_recommendations': internal_data.get('communication_style', [])
        },
        'sales_insights': {
            **crystal_data.get('sales_insights', {}),
            'internal_approach': internal_data.get('sales_approach', '')
        },
        'behavioral_predictions': crystal_data.get('behavioral_predictions', {}),
        'behavioral_insights': crystal_data.get('behavioral_insights', {}),
        'strengths': internal_data.get('traits', []),
        'confidence_score': max(
            crystal_data.get('confidence_score', 0.8),
            internal_data.get('confidence', 0.6)
        ),
        'data_sources': ['crystal_knows', 'internal_analysis']
    }

def _format_internal_as_combined(internal_data: Dict) -> Dict[str, Any]:
    """Format internal analysis to match combined format"""
    
    return {
        'personality_type': internal_data.get('disc_profile', 'D'),
        'personality_description': 'Generated by internal analysis',
        'disc_scores': internal_data.get('disc_scores', {}),
        'big_five': {
            'openness': 0.5,
            'conscientiousness': 0.5,
            'extraversion': 0.5,
            'agreeableness': 0.5,
            'neuroticism': 0.5
        },
        'communication_style': {
            'primary_style': 'direct',
            'preferences': internal_data.get('communication_style', []),
            'internal_recommendations': internal_data.get('communication_style', [])
        },
        'sales_insights': {
            'approach': internal_data.get('sales_approach', ''),
            'internal_approach': internal_data.get('sales_approach', '')
        },
        'behavioral_predictions': {
            'work_style': 'analytical',
            'stress_response': 'problem-solving',
            'team_role': 'contributor',
            'leadership_style': 'collaborative'
        },
        'strengths': internal_data.get('traits', []),
        'confidence_score': internal_data.get('confidence', 0.6),
        'data_sources': ['internal_analysis']
    }

def _generate_personality_wheel_data(insights: Dict) -> Dict[str, Any]:
    """Generate data for personality wheel visualization"""
    
    disc_scores = insights.get('disc_scores', {})
    big_five = insights.get('big_five', {})
    
    return {
        'disc_wheel': {
            'dominance': disc_scores.get('D', 0) * 100,
            'influence': disc_scores.get('I', 0) * 100,
            'steadiness': disc_scores.get('S', 0) * 100,
            'conscientiousness': disc_scores.get('C', 0) * 100
        },
        'big_five_radar': {
            'openness': big_five.get('openness', 0.5) * 100,
            'conscientiousness': big_five.get('conscientiousness', 0.5) * 100,
            'extraversion': big_five.get('extraversion', 0.5) * 100,
            'agreeableness': big_five.get('agreeableness', 0.5) * 100,
            'neuroticism': (1 - big_five.get('neuroticism', 0.5)) * 100  # Invert for positive display
        }
    }

def _generate_sales_intelligence(insights: Dict) -> Dict[str, Any]:
    """Generate comprehensive sales intelligence"""
    
    personality_type = insights.get('personality_type', 'D')
    sales_insights = insights.get('sales_insights', {})
    
    # Personality-specific sales strategies
    sales_strategies = {
        'D': {
            'primary_approach': 'Results & ROI focused',
            'presentation_style': 'Brief, direct, bottom-line focused',
            'closing_technique': 'Assumptive close, emphasize competitive advantage',
            'objection_handling': 'Address head-on with data and logic',
            'follow_up_style': 'Quick, professional, action-oriented'
        },
        'I': {
            'primary_approach': 'Relationship & innovation focused',
            'presentation_style': 'Engaging, visual, story-driven',
            'closing_technique': 'Social proof, testimonials, excitement-based',
            'objection_handling': 'Acknowledge feelings, provide social validation',
            'follow_up_style': 'Personal, frequent, enthusiastic'
        },
        'S': {
            'primary_approach': 'Security & reliability focused',
            'presentation_style': 'Detailed, step-by-step, supportive',
            'closing_technique': 'Trial close, guarantee focus, consensus building',
            'objection_handling': 'Patient explanation, risk mitigation',
            'follow_up_style': 'Consistent, supportive, reassuring'
        },
        'C': {
            'primary_approach': 'Data & accuracy focused',
            'presentation_style': 'Detailed, fact-based, methodical',
            'closing_technique': 'Logic-based, detailed comparison, proof',
            'objection_handling': 'Detailed explanation with supporting data',
            'follow_up_style': 'Informative, professional, thorough'
        }
    }
    
    strategy = sales_strategies.get(personality_type[0] if personality_type else 'D', sales_strategies['D'])
    
    return {
        'sales_strategy': strategy,
        'meeting_recommendations': {
            'optimal_duration': _get_optimal_meeting_duration(personality_type),
            'best_time': _get_best_meeting_time(personality_type),
            'preparation_tips': _get_meeting_prep_tips(personality_type),
            'agenda_style': _get_agenda_style(personality_type)
        },
        'email_guidelines': {
            'subject_line_style': _get_email_subject_style(personality_type),
            'message_length': _get_optimal_email_length(personality_type),
            'tone': _get_email_tone(personality_type),
            'call_to_action': _get_cta_style(personality_type)
        },
        'negotiation_strategy': {
            'approach': _get_negotiation_approach(personality_type),
            'concession_strategy': _get_concession_strategy(personality_type),
            'decision_timeline': _get_decision_timeline(personality_type)
        }
    }

def _generate_behavioral_predictions(ai_insight) -> Dict[str, Any]:
    """Generate behavioral predictions based on AI insights"""
    
    personality_type = ai_insight.personality_type or 'D'
    
    return {
        'decision_making': {
            'style': _predict_decision_style(personality_type),
            'timeline': _predict_decision_timeline(personality_type),
            'influencers': _predict_decision_influencers(personality_type),
            'information_needs': _predict_information_needs(personality_type)
        },
        'communication_preferences': {
            'channel_priority': _predict_communication_channels(personality_type),
            'frequency': _predict_communication_frequency(personality_type),
            'timing': _predict_optimal_timing(personality_type),
            'message_style': _predict_message_style(personality_type)
        },
        'stress_response': {
            'triggers': _predict_stress_triggers(personality_type),
            'indicators': _predict_stress_indicators(personality_type),
            'management': _predict_stress_management(personality_type)
        },
        'motivation_factors': {
            'primary_drivers': _predict_primary_motivators(personality_type),
            'recognition_style': _predict_recognition_preferences(personality_type),
            'goal_orientation': _predict_goal_orientation(personality_type)
        }
    }

def _generate_communication_guide(insights: Dict, context: str) -> Dict[str, Any]:
    """Generate context-specific communication guide"""
    
    personality_type = insights.get('personality_type', 'D')
    
    guides = {
        'sales': _generate_sales_communication_guide(personality_type),
        'meeting': _generate_meeting_communication_guide(personality_type),
        'email': _generate_email_communication_guide(personality_type),
        'phone': _generate_phone_communication_guide(personality_type)
    }
    
    base_guide = guides.get(context, guides['sales'])
    
    return {
        'context': context,
        'personality_type': personality_type,
        'guide': base_guide,
        'quick_tips': _generate_quick_communication_tips(personality_type, context),
        'avoid_list': _generate_communication_avoid_list(personality_type, context),
        'example_phrases': _generate_example_phrases(personality_type, context)
    }

# Helper functions for predictions and guides
def _predict_decision_style(personality_type: str) -> str:
    styles = {
        'D': 'Fast, intuitive, risk-taking',
        'I': 'Collaborative, emotion-based, optimistic',
        'S': 'Cautious, consensus-seeking, stability-focused',
        'C': 'Analytical, data-driven, thorough'
    }
    return styles.get(personality_type[0] if personality_type else 'D', styles['D'])

def _predict_decision_timeline(personality_type: str) -> str:
    timelines = {
        'D': 'Quick (days to weeks)',
        'I': 'Moderate (weeks)',
        'S': 'Extended (weeks to months)',
        'C': 'Thorough (weeks to months)'
    }
    return timelines.get(personality_type[0] if personality_type else 'D', timelines['D'])

def _get_optimal_meeting_duration(personality_type: str) -> str:
    durations = {
        'D': '30-45 minutes (brief, focused)',
        'I': '45-60 minutes (engaging, interactive)',
        'S': '45-60 minutes (thorough, supportive)',
        'C': '60-90 minutes (detailed, comprehensive)'
    }
    return durations.get(personality_type[0] if personality_type else 'D', durations['D'])

def _get_email_subject_style(personality_type: str) -> str:
    styles = {
        'D': 'Direct, benefit-focused, urgent',
        'I': 'Engaging, personal, innovative',
        'S': 'Supportive, clear, reassuring',
        'C': 'Specific, factual, professional'
    }
    return styles.get(personality_type[0] if personality_type else 'D', styles['D'])

def _generate_sales_communication_guide(personality_type: str) -> Dict[str, Any]:
    guides = {
        'D': {
            'opening': 'Get straight to the point, mention ROI immediately',
            'presentation': 'Focus on results, competitive advantages, executive summary',
            'closing': 'Ask for the decision, create urgency, emphasize outcomes',
            'follow_up': 'Brief updates, progress reports, next steps'
        },
        'I': {
            'opening': 'Build rapport, share success stories, be enthusiastic',
            'presentation': 'Use visuals, testimonials, focus on innovation and impact',
            'closing': 'Paint the vision, use social proof, make it exciting',
            'follow_up': 'Personal check-ins, celebration of progress, team involvement'
        },
        'S': {
            'opening': 'Build trust slowly, show stability, be supportive',
            'presentation': 'Detailed explanation, risk mitigation, team benefits',
            'closing': 'Trial periods, guarantees, consensus building',
            'follow_up': 'Regular check-ins, support availability, reassurance'
        },
        'C': {
            'opening': 'Professional approach, data presentation, logical structure',
            'presentation': 'Detailed analysis, comparisons, technical specifications',
            'closing': 'Logical conclusion, detailed proposals, proof points',
            'follow_up': 'Detailed follow-ups, additional information, methodical progress'
        }
    }
    return guides.get(personality_type[0] if personality_type else 'D', guides['D'])

# Additional helper functions would continue here...
def _predict_communication_channels(personality_type: str) -> List[str]:
    channels = {
        'D': ['phone', 'brief_email', 'text'],
        'I': ['video_call', 'social_media', 'phone'],
        'S': ['email', 'phone', 'in_person'],
        'C': ['email', 'documentation', 'formal_meetings']
    }
    return channels.get(personality_type[0] if personality_type else 'D', channels['D'])

def _predict_primary_motivators(personality_type: str) -> List[str]:
    motivators = {
        'D': ['achievement', 'control', 'competition', 'results'],
        'I': ['recognition', 'social_impact', 'innovation', 'collaboration'],
        'S': ['security', 'stability', 'teamwork', 'helping_others'],
        'C': ['accuracy', 'quality', 'expertise', 'logical_systems']
    }
    return motivators.get(personality_type[0] if personality_type else 'D', motivators['D'])

def _generate_quick_communication_tips(personality_type: str, context: str) -> List[str]:
    tips = {
        'D': [
            'Be direct and concise',
            'Focus on bottom-line results',
            'Avoid lengthy explanations',
            'Emphasize competitive advantages'
        ],
        'I': [
            'Start with relationship building',
            'Use stories and examples',
            'Be enthusiastic and positive',
            'Include social elements'
        ],
        'S': [
            'Be patient and supportive',
            'Provide detailed explanations',
            'Emphasize stability and security',
            'Build consensus gradually'
        ],
        'C': [
            'Provide detailed information',
            'Use facts and data',
            'Be precise and accurate',
            'Allow time for analysis'
        ]
    }
    return tips.get(personality_type[0] if personality_type else 'D', tips['D'])

def _generate_example_phrases(personality_type: str, context: str) -> Dict[str, List[str]]:
    phrases = {
        'D': {
            'opening': [
                "Let me cut to the chase...",
                "Here's what this means for your bottom line...",
                "This will give you a competitive edge because..."
            ],
            'closing': [
                "What do you need to move forward?",
                "When can we start seeing results?",
                "Let's make this happen."
            ]
        },
        'I': {
            'opening': [
                "I'm excited to share this opportunity with you...",
                "Here's how other successful leaders have...",
                "This innovative approach will..."
            ],
            'closing': [
                "I can already see how this will transform your team...",
                "Your colleagues will be impressed when...",
                "Let's create something amazing together."
            ]
        },
        'S': {
            'opening': [
                "I want to make sure this is a good fit for you...",
                "Let me walk you through this step by step...",
                "This will provide the security and stability..."
            ],
            'closing': [
                "We'll support you every step of the way...",
                "There's no risk with our guarantee...",
                "Let's start with a trial to ensure your comfort."
            ]
        },
        'C': {
            'opening': [
                "Based on the data, here's what we've found...",
                "The analysis shows...",
                "Here are the detailed specifications..."
            ],
            'closing': [
                "The logical conclusion is...",
                "Based on this analysis, the best option is...",
                "Here's the detailed proposal for your review."
            ]
        }
    }
    return phrases.get(personality_type[0] if personality_type else 'D', phrases['D'])

# Additional helper functions for comprehensive psychometric analysis
def _get_best_meeting_time(personality_type: str) -> str:
    times = {
        'D': 'Early morning (8-10 AM) - high energy, focused',
        'I': 'Mid-morning (10 AM-12 PM) - social, collaborative time',
        'S': 'Afternoon (1-3 PM) - steady, thoughtful discussions',
        'C': 'Any structured time with proper agenda'
    }
    return times.get(personality_type[0] if personality_type else 'D', times['D'])

def _get_meeting_prep_tips(personality_type: str) -> List[str]:
    tips = {
        'D': [
            'Prepare executive summary',
            'Have clear agenda with time limits',
            'Focus on outcomes and ROI',
            'Bring decision-making materials'
        ],
        'I': [
            'Prepare engaging visuals',
            'Include success stories and testimonials',
            'Plan interactive discussions',
            'Bring team perspectives'
        ],
        'S': [
            'Prepare detailed documentation',
            'Include risk mitigation strategies',
            'Plan step-by-step explanations',
            'Bring support and guarantee information'
        ],
        'C': [
            'Prepare detailed analysis',
            'Bring comprehensive data',
            'Include comparison charts',
            'Have technical specifications ready'
        ]
    }
    return tips.get(personality_type[0] if personality_type else 'D', tips['D'])

def _get_agenda_style(personality_type: str) -> str:
    styles = {
        'D': 'Brief, outcome-focused, time-bound',
        'I': 'Interactive, collaborative, flexible',
        'S': 'Detailed, step-by-step, supportive',
        'C': 'Comprehensive, logical, methodical'
    }
    return styles.get(personality_type[0] if personality_type else 'D', styles['D'])

def _get_optimal_email_length(personality_type: str) -> str:
    lengths = {
        'D': 'Brief (2-3 sentences max)',
        'I': 'Moderate (1-2 paragraphs with visuals)',
        'S': 'Detailed (comprehensive but supportive)',
        'C': 'Comprehensive (detailed with data/attachments)'
    }
    return lengths.get(personality_type[0] if personality_type else 'D', lengths['D'])

def _get_email_tone(personality_type: str) -> str:
    tones = {
        'D': 'Direct, confident, results-focused',
        'I': 'Friendly, enthusiastic, collaborative',
        'S': 'Supportive, patient, reassuring',
        'C': 'Professional, factual, precise'
    }
    return tones.get(personality_type[0] if personality_type else 'D', tones['D'])

def _get_cta_style(personality_type: str) -> str:
    ctas = {
        'D': 'Direct action - "Call me now to move forward"',
        'I': 'Collaborative - "Let\'s discuss this exciting opportunity"',
        'S': 'Supportive - "I\'m here when you\'re ready to talk"',
        'C': 'Informative - "Review the attached analysis and let me know your thoughts"'
    }
    return ctas.get(personality_type[0] if personality_type else 'D', ctas['D'])

def _get_negotiation_approach(personality_type: str) -> str:
    approaches = {
        'D': 'Competitive - direct, win-win focused, quick decisions',
        'I': 'Collaborative - relationship-based, creative solutions',
        'S': 'Accommodating - consensus-building, risk-averse',
        'C': 'Analytical - data-driven, logical, thorough evaluation'
    }
    return approaches.get(personality_type[0] if personality_type else 'D', approaches['D'])

def _get_concession_strategy(personality_type: str) -> str:
    strategies = {
        'D': 'Package deals, quick concessions for quick decisions',
        'I': 'Creative value-adds, relationship-enhancing benefits',
        'S': 'Gradual concessions, security-focused additions',
        'C': 'Logical trade-offs, detailed justifications'
    }
    return strategies.get(personality_type[0] if personality_type else 'D', strategies['D'])

def _get_decision_timeline(personality_type: str) -> str:
    timelines = {
        'D': 'Fast - days to 1 week',
        'I': 'Moderate - 1-3 weeks',
        'S': 'Extended - 1-3 months',
        'C': 'Thorough - 2-6 months'
    }
    return timelines.get(personality_type[0] if personality_type else 'D', timelines['D'])

def _predict_decision_influencers(personality_type: str) -> List[str]:
    influencers = {
        'D': ['Senior executives', 'Board members', 'Key stakeholders'],
        'I': ['Team members', 'Colleagues', 'Industry peers'],
        'S': ['Trusted advisors', 'Long-term partners', 'Risk assessors'],
        'C': ['Technical experts', 'Analysts', 'Compliance officers']
    }
    return influencers.get(personality_type[0] if personality_type else 'D', influencers['D'])

def _predict_information_needs(personality_type: str) -> List[str]:
    needs = {
        'D': ['ROI analysis', 'Competitive comparison', 'Implementation timeline'],
        'I': ['Success stories', 'Innovation potential', 'Team impact'],
        'S': ['Risk assessment', 'Support structure', 'Implementation support'],
        'C': ['Technical specifications', 'Detailed analysis', 'Compliance information']
    }
    return needs.get(personality_type[0] if personality_type else 'D', needs['D'])

def _predict_communication_frequency(personality_type: str) -> str:
    frequencies = {
        'D': 'Minimal - only when necessary or with updates',
        'I': 'Regular - weekly check-ins and relationship building',
        'S': 'Consistent - bi-weekly structured communications',
        'C': 'Scheduled - monthly detailed reports and analysis'
    }
    return frequencies.get(personality_type[0] if personality_type else 'D', frequencies['D'])

def _predict_optimal_timing(personality_type: str) -> Dict[str, str]:
    timings = {
        'D': {
            'best_day': 'Tuesday-Thursday',
            'best_time': '8-10 AM',
            'avoid': 'Friday afternoons, Mondays'
        },
        'I': {
            'best_day': 'Tuesday-Wednesday',
            'best_time': '10 AM-12 PM',
            'avoid': 'Early mornings, late afternoons'
        },
        'S': {
            'best_day': 'Wednesday-Thursday',
            'best_time': '1-3 PM',
            'avoid': 'Monday mornings, Friday afternoons'
        },
        'C': {
            'best_day': 'Tuesday-Thursday',
            'best_time': 'Any scheduled time',
            'avoid': 'Unscheduled calls, rushed meetings'
        }
    }
    return timings.get(personality_type[0] if personality_type else 'D', timings['D'])

def _predict_message_style(personality_type: str) -> str:
    styles = {
        'D': 'Direct, bullet points, action-oriented',
        'I': 'Conversational, storytelling, engaging',
        'S': 'Detailed, supportive, step-by-step',
        'C': 'Formal, factual, well-documented'
    }
    return styles.get(personality_type[0] if personality_type else 'D', styles['D'])

def _predict_stress_triggers(personality_type: str) -> List[str]:
    triggers = {
        'D': ['Delays', 'Micromanagement', 'Indecision', 'Bureaucracy'],
        'I': ['Isolation', 'Negative feedback', 'Rigid processes', 'Conflict'],
        'S': ['Sudden changes', 'Conflict', 'Time pressure', 'Uncertainty'],
        'C': ['Incomplete information', 'Rush decisions', 'Ambiguity', 'Errors']
    }
    return triggers.get(personality_type[0] if personality_type else 'D', triggers['D'])

def _predict_stress_indicators(personality_type: str) -> List[str]:
    indicators = {
        'D': ['Impatience', 'Direct criticism', 'Bypassing processes'],
        'I': ['Withdrawal', 'Reduced enthusiasm', 'Avoiding meetings'],
        'S': ['Resistance to change', 'Over-analysis', 'Seeking reassurance'],
        'C': ['Perfectionism', 'Over-documentation', 'Analysis paralysis']
    }
    return indicators.get(personality_type[0] if personality_type else 'D', indicators['D'])

def _predict_stress_management(personality_type: str) -> List[str]:
    management = {
        'D': ['Give autonomy', 'Focus on results', 'Remove obstacles'],
        'I': ['Provide recognition', 'Encourage collaboration', 'Maintain positivity'],
        'S': ['Offer support', 'Provide stability', 'Allow processing time'],
        'C': ['Provide information', 'Allow thorough analysis', 'Respect expertise']
    }
    return management.get(personality_type[0] if personality_type else 'D', management['D'])

def _predict_recognition_preferences(personality_type: str) -> str:
    preferences = {
        'D': 'Public recognition for achievements and results',
        'I': 'Social recognition and peer appreciation',
        'S': 'Private appreciation and team acknowledgment',
        'C': 'Professional recognition for expertise and quality'
    }
    return preferences.get(personality_type[0] if personality_type else 'D', preferences['D'])

def _predict_goal_orientation(personality_type: str) -> str:
    orientations = {
        'D': 'Results-oriented, competitive, achievement-focused',
        'I': 'People-oriented, collaborative, impact-focused',
        'S': 'Process-oriented, team-focused, stability-seeking',
        'C': 'Quality-oriented, accuracy-focused, expertise-building'
    }
    return orientations.get(personality_type[0] if personality_type else 'D', orientations['D'])

def _generate_meeting_communication_guide(personality_type: str) -> Dict[str, Any]:
    guides = {
        'D': {
            'preparation': 'Agenda with clear outcomes, time limits',
            'opening': 'Start with objectives, skip small talk',
            'presentation': 'Executive summary first, key points only',
            'interaction': 'Direct questions, quick decisions',
            'closing': 'Clear next steps, deadlines, accountability'
        },
        'I': {
            'preparation': 'Interactive agenda, relationship building time',
            'opening': 'Warm greeting, personal connection',
            'presentation': 'Stories, visuals, collaborative discussion',
            'interaction': 'Encourage participation, brainstorming',
            'closing': 'Excitement for next steps, team involvement'
        },
        'S': {
            'preparation': 'Detailed agenda, supportive materials',
            'opening': 'Patient greeting, comfort establishment',
            'presentation': 'Step-by-step, thorough explanation',
            'interaction': 'Allow processing time, answer questions',
            'closing': 'Reassurance, support availability, gradual progression'
        },
        'C': {
            'preparation': 'Comprehensive agenda, data packages',
            'opening': 'Professional greeting, structured approach',
            'presentation': 'Detailed analysis, facts and figures',
            'interaction': 'Technical discussions, logical flow',
            'closing': 'Summary of facts, logical next steps'
        }
    }
    return guides.get(personality_type[0] if personality_type else 'D', guides['D'])

def _generate_email_communication_guide(personality_type: str) -> Dict[str, Any]:
    guides = {
        'D': {
            'subject': 'Direct, benefit-focused, urgent',
            'opening': 'Skip pleasantries, get to point',
            'body': 'Bullet points, key benefits, ROI',
            'closing': 'Clear call to action, deadline',
            'signature': 'Professional, contact info, availability'
        },
        'I': {
            'subject': 'Engaging, personal, opportunity-focused',
            'opening': 'Personal greeting, relationship reference',
            'body': 'Stories, enthusiasm, collaborative language',
            'closing': 'Excited next steps, open invitation',
            'signature': 'Friendly, social media links, personal touch'
        },
        'S': {
            'subject': 'Clear, supportive, non-threatening',
            'opening': 'Warm greeting, appreciation',
            'body': 'Detailed explanation, support offered',
            'closing': 'Patient availability, no pressure',
            'signature': 'Supportive, multiple contact options'
        },
        'C': {
            'subject': 'Specific, factual, professional',
            'opening': 'Professional greeting, context',
            'body': 'Detailed information, attachments, data',
            'closing': 'Logical next steps, thorough follow-up',
            'signature': 'Professional, credentials, expertise'
        }
    }
    return guides.get(personality_type[0] if personality_type else 'D', guides['D'])

def _generate_phone_communication_guide(personality_type: str) -> Dict[str, Any]:
    guides = {
        'D': {
            'preparation': 'Agenda, key points, time limit',
            'opening': 'Brief greeting, purpose statement',
            'conversation': 'Direct, results-focused, efficient',
            'handling_objections': 'Address directly with facts',
            'closing': 'Clear outcomes, next actions, timeline'
        },
        'I': {
            'preparation': 'Talking points, relationship notes',
            'opening': 'Warm greeting, personal connection',
            'conversation': 'Engaging, enthusiastic, collaborative',
            'handling_objections': 'Acknowledge, redirect positively',
            'closing': 'Exciting next steps, continued engagement'
        },
        'S': {
            'preparation': 'Detailed notes, support materials ready',
            'opening': 'Patient greeting, comfort building',
            'conversation': 'Supportive, detailed, reassuring',
            'handling_objections': 'Patient explanation, risk mitigation',
            'closing': 'Supportive next steps, availability assurance'
        },
        'C': {
            'preparation': 'Comprehensive information, data ready',
            'opening': 'Professional greeting, structured approach',
            'conversation': 'Factual, detailed, logical',
            'handling_objections': 'Data-driven responses, thorough explanation',
            'closing': 'Logical conclusion, detailed follow-up plan'
        }
    }
    return guides.get(personality_type[0] if personality_type else 'D', guides['D'])

def _generate_communication_avoid_list(personality_type: str, context: str) -> List[str]:
    avoid_lists = {
        'D': [
            'Long explanations without clear purpose',
            'Emotional appeals without logical backing',
            'Wasting time with small talk',
            'Indecisiveness or lack of urgency'
        ],
        'I': [
            'Cold, impersonal communication',
            'Negative or pessimistic language',
            'Isolation from team involvement',
            'Overly technical or dry content'
        ],
        'S': [
            'High pressure tactics',
            'Sudden changes without explanation',
            'Confrontational approaches',
            'Rushing decision-making process'
        ],
        'C': [
            'Incomplete or inaccurate information',
            'Emotional manipulation',
            'Rushing without proper analysis',
            'Overly casual or unprofessional tone'
        ]
    }
    return avoid_lists.get(personality_type[0] if personality_type else 'D', avoid_lists['D'])

# ... existing code ... 