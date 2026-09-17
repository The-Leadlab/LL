import random
import json
from typing import Dict, Any, List, Optional
from datetime import datetime, timedelta
import logging
from app.services.enhanced_linkedin_scraper import EnhancedLinkedInScraper
from sqlalchemy.orm import Session
from app.models.ai_insights import AIInsight
from app.database import SessionLocal

logger = logging.getLogger(__name__)

class InternalPsychometricAnalyzer:
    """
    Kendi iç psikometrik analiz sistemimiz - Crystal Knows benzeri
    LinkedIn profili, iş unvanı, endüstri bilgilerini kullanarak 
    detaylı kişilik analizi yapar
    """
    
    def __init__(self):
        self.disc_profiles = self._load_disc_profiles()
        self.big_five_mapping = self._load_big_five_mapping()
        self.industry_patterns = self._load_industry_patterns()
        self.job_title_patterns = self._load_job_title_patterns()
        
        self.confidence_weights = {
            "job_title": 0.30,
            "industry": 0.20,
            "company": 0.15,
            "linkedin_data": 0.25,  # New weight for enhanced LinkedIn data
            "email": 0.05,
            "name": 0.05
        }
        
        # Initialize enhanced LinkedIn scraper
        self.linkedin_scraper = EnhancedLinkedInScraper()
        self._cache = {}  # In-memory cache for session
        self._cache_duration = timedelta(hours=1)  # Cache for 1 hour
        
    def analyze_lead_comprehensive(self, lead, refresh: bool = False, db: Session = None) -> Dict[str, Any]:
        """Ana analiz fonksiyonu - kapsamlı psikometrik analiz"""
        
        # Database session oluştur eğer verilmemişse
        if db is None:
            db = SessionLocal()
            close_db = True
        else:
            close_db = False
        
        try:
            # Check database first (unless refresh=True)
            if not refresh:
                existing_insight = db.query(AIInsight).filter(
                    AIInsight.lead_id == lead.id
                ).order_by(AIInsight.updated_at.desc()).first()
                
                if existing_insight and existing_insight.updated_at:
                    # Check if analysis is recent (less than 24 hours old)
                    time_diff = datetime.utcnow() - existing_insight.updated_at
                    if time_diff < timedelta(hours=24):
                        logger.info(f"🗄️ Using database cached psychometric data for lead {lead.id}")
                        return self._convert_db_to_response(existing_insight, lead)
            
            # Check in-memory cache
            cache_key = f"psychometric_{lead.id}"
            if not refresh and cache_key in self._cache:
                cached_data, cached_time = self._cache[cache_key]
                if datetime.now() - cached_time < self._cache_duration:
                    logger.info(f"🔄 Using in-memory cached psychometric data for lead {lead.id}")
                    return cached_data
            
            logger.info(f"🧠 Starting {'fresh' if refresh else 'new'} psychometric analysis for lead {lead.id}")
            
            # Lead'den verileri çıkar (refresh=True ise enhanced LinkedIn data da çek)
            lead_data = self._extract_lead_data(lead, include_enhanced_linkedin=refresh)
            
            # DISC analizi (enhanced data ile)
            disc_analysis = self._analyze_disc_profile(lead_data)
            
            # Big Five analizi (enhanced data ile)
            big_five_analysis = self._analyze_big_five(lead_data)
            
            # Kişilik tipi belirle
            personality_type = self._determine_personality_type(disc_analysis, big_five_analysis)
            
            # İletişim tarzı analizi
            communication_style = self._analyze_communication_style(lead_data, personality_type)
            
            # Satış stratejisi önerileri
            sales_intelligence = self._generate_sales_intelligence(personality_type, lead_data)
            
            # Davranışsal tahminler
            behavioral_predictions = self._generate_behavioral_predictions(personality_type)
            
            # Güven skoru hesapla (enhanced data dahil)
            confidence_score = self._calculate_confidence_score(lead_data)
            
            # Enhanced LinkedIn insights ekleme
            enhanced_insights = self._extract_enhanced_insights(lead_data) if refresh else {}
            
            result = {
                "lead_id": lead.id,
                "analysis_methods": ["advanced_internal_ai", "disc_analysis", "big_five_assessment", "enhanced_linkedin_extraction"],
                "analysis_timestamp": datetime.now().isoformat(),
                "confidence_score": confidence_score,
                "enhanced_linkedin_insights": enhanced_insights,
                "combined_insights": {
                    "personality_type": personality_type,
                    "personality_description": self._get_personality_description(personality_type),
                    "disc_scores": disc_analysis,
                    "big_five": big_five_analysis,
                    "communication_style": communication_style,
                    "sales_insights": {
                        "approach": sales_intelligence["primary_approach"],
                        "objections": sales_intelligence["likely_objections"],
                        "motivators": sales_intelligence["key_motivators"],
                        "decision_style": sales_intelligence["decision_making_style"]
                    },
                    "behavioral_predictions": behavioral_predictions,
                    "strengths": self._identify_strengths(personality_type, disc_analysis),
                    "confidence_score": confidence_score,
                    "data_sources": self._get_data_sources(lead_data),
                    "data_completeness": {
                        "job_title": bool(lead_data.get('job_title')),
                        "industry": bool(lead_data.get('industry')),
                        "company": bool(lead_data.get('company')),
                        "linkedin": bool(lead_data.get('linkedin_url')),
                        "enhanced_linkedin": bool(lead_data.get('enhanced_linkedin', {})),
                        "email": bool(lead_data.get('email'))
                    }
                },
                "personality_wheel": {
                    "disc_wheel": disc_analysis,
                    "big_five_radar": big_five_analysis
                },
                "sales_intelligence": sales_intelligence
            }
            
            # Save to database
            self._save_to_database(db, lead, result, disc_analysis, personality_type, communication_style, confidence_score)
            
            # Cache the result in memory
            self._cache[cache_key] = (result, datetime.now())
            logger.info(f"✅ Psychometric analysis completed, cached, and saved to database for lead {lead.id}")
            
            return result
            
        finally:
            if close_db:
                db.close()

    def _save_to_database(self, db: Session, lead, result: Dict[str, Any], disc_analysis: Dict[str, float], 
                         personality_type: str, communication_style: Dict[str, Any], confidence_score: float):
        """Save psychometric analysis to database"""
        try:
            # Check if record exists
            existing = db.query(AIInsight).filter(AIInsight.lead_id == lead.id).first()
            
            # Prepare data for database
            db_data = {
                "lead_id": lead.id,
                "user_id": getattr(lead, 'user_id', 1),
                "organization_id": getattr(lead, 'organization_id', 1),
                "quality_score": confidence_score * 100,  # Convert to 0-100 scale
                "priority_score": max(disc_analysis.values()),  # Use highest DISC score as priority
                "confidence_score": confidence_score,
                "personality_type": personality_type,
                "disc_profile": f"{disc_analysis['D']:.0f}-{disc_analysis['I']:.0f}-{disc_analysis['S']:.0f}-{disc_analysis['C']:.0f}",  # Shorter format
                "communication_style": communication_style.get('primary_style', '')[:100],  # Limit length
                "strengths": result["combined_insights"]["strengths"],  # Keep as list/JSON
                "recommendations": {
                    "sales_approach": result["sales_intelligence"]["primary_approach"],
                    "communication_tips": communication_style.get('internal_recommendations', [])[:3],  # Limit to 3 tips
                    "motivators": result["combined_insights"]["sales_insights"]["motivators"][:3]  # Limit to 3 motivators
                },
                "sales_approach": result["sales_intelligence"]["primary_approach"][:500],  # Limit length
                "features_used": len(result["combined_insights"]["data_sources"]),
                "ai_model_version": "internal_v2.0",
                "analysis_provider": "internal_psychometric_analyzer"
            }
            
            if existing:
                # Update existing record
                for key, value in db_data.items():
                    if key not in ['lead_id']:  # Don't update lead_id
                        setattr(existing, key, value)
                existing.updated_at = datetime.utcnow()
                logger.info(f"💾 Updated existing psychometric record for lead {lead.id}")
            else:
                # Create new record
                new_insight = AIInsight(**db_data)
                db.add(new_insight)
                logger.info(f"💾 Created new psychometric record for lead {lead.id}")

            # Persist full analysis on the lead so API/UI filters (psychometrics.combined_insights) work
            lead.psychometrics = result
            
            db.commit()
            
        except Exception as e:
            logger.error(f"❌ Failed to save psychometric data to database for lead {lead.id}: {e}")
            db.rollback()
            # Don't re-raise the exception, just log it so analysis can continue

    def _convert_db_to_response(self, db_insight: AIInsight, lead) -> Dict[str, Any]:
        """Convert database AIInsight to API response format"""
        
        # Parse DISC profile from string (new format: "22-12-27-39")
        disc_scores = {"D": 25.0, "I": 25.0, "S": 25.0, "C": 25.0}
        if db_insight.disc_profile:
            try:
                if '-' in db_insight.disc_profile:
                    # New format: "22-12-27-39"
                    parts = db_insight.disc_profile.split('-')
                    if len(parts) == 4:
                        disc_scores["D"] = float(parts[0])
                        disc_scores["I"] = float(parts[1])
                        disc_scores["S"] = float(parts[2])
                        disc_scores["C"] = float(parts[3])
                else:
                    # Old format: "D:22.0 I:12.2 S:26.8 C:39.0"
                    parts = db_insight.disc_profile.split()
                    for part in parts:
                        if ':' in part:
                            key, value = part.split(':')
                            disc_scores[key] = float(value)
            except Exception as e:
                logger.warning(f"Failed to parse DISC profile '{db_insight.disc_profile}': {e}")
        
        # Generate Big Five from DISC (simplified mapping)
        big_five = {
            "openness": min(85, max(15, disc_scores["I"] + disc_scores["D"] - 10)),
            "conscientiousness": min(85, max(15, disc_scores["C"] + 10)),
            "extraversion": min(85, max(15, disc_scores["I"] + 5)),
            "agreeableness": min(85, max(15, disc_scores["S"] + 10)),
            "neuroticism": min(85, max(15, 50 - disc_scores["S"]))
        }
        
        return {
            "lead_id": lead.id,
            "analysis_methods": ["database_cached", "advanced_internal_ai"],
            "analysis_timestamp": db_insight.updated_at.isoformat(),
            "confidence_score": db_insight.confidence_score,
            "enhanced_linkedin_insights": {},
            "combined_insights": {
                "personality_type": db_insight.personality_type or "Balanced",
                "personality_description": self._get_personality_description(db_insight.personality_type or "Balanced"),
                "disc_scores": disc_scores,
                "big_five": big_five,
                "communication_style": {
                    "primary_style": db_insight.communication_style or "Balanced",
                    "preferences": ["Professional", "Clear"],
                    "internal_recommendations": db_insight.recommendations.get('communication_tips', []) if db_insight.recommendations else []
                },
                "sales_insights": {
                    "approach": db_insight.sales_approach or "Consultative",
                    "objections": ["Price concerns", "Timing issues"],
                    "motivators": db_insight.recommendations.get('motivators', []) if db_insight.recommendations else ["Success", "Recognition"],
                    "decision_style": "Analytical"
                },
                "behavioral_predictions": self._generate_behavioral_predictions(db_insight.personality_type or "Balanced"),
                "strengths": db_insight.strengths or ["Professional", "Reliable"],
                "confidence_score": db_insight.confidence_score,
                "data_sources": ["database", "job_title", "company"],
                "data_completeness": {
                    "job_title": True,
                    "industry": True,
                    "company": True,
                    "linkedin": False,
                    "enhanced_linkedin": False,
                    "email": True
                }
            },
            "personality_wheel": {
                "disc_wheel": disc_scores,
                "big_five_radar": big_five
            },
            "sales_intelligence": {
                "primary_approach": db_insight.sales_approach or "Consultative",
                "presentation_style": "Professional",
                "closing_technique": "Assumptive",
                "objection_handling": "Logical",
                "follow_up_style": "Systematic",
                "likely_objections": ["Budget", "Timing"],
                "key_motivators": db_insight.recommendations.get('motivators', []) if db_insight.recommendations else ["Success"],
                "decision_making_style": "Analytical"
            }
        }
    
    def _extract_lead_data(self, lead, include_enhanced_linkedin: bool = False) -> Dict[str, Any]:
        """Lead'den analiz için gerekli verileri çıkar"""
        base_data = {
            "first_name": getattr(lead, 'first_name', '') or '',
            "last_name": getattr(lead, 'last_name', '') or '',
            "email": getattr(lead, 'email', '') or '',
            "job_title": getattr(lead, 'job_title', '') or '',
            "company": getattr(lead, 'company', '') or '',
            "industry": getattr(lead, 'industry', None) or getattr(lead, 'sector', '') or '',
            "linkedin_url": getattr(lead, 'linkedin', '') or '',
            "phone": getattr(lead, 'phone', '') or '',
            "notes": getattr(lead, 'notes', '') or ''
        }
        
        # Enhanced LinkedIn data extraction
        if include_enhanced_linkedin and base_data["linkedin_url"]:
            try:
                logger.info(f"🔍 Extracting enhanced LinkedIn data from: {base_data['linkedin_url']}")
                enhanced_linkedin_data = self.linkedin_scraper.extract_psychometric_data(base_data["linkedin_url"])
                base_data["enhanced_linkedin"] = enhanced_linkedin_data
                logger.info(f"✅ Enhanced LinkedIn data extracted successfully")
            except Exception as e:
                logger.warning(f"⚠️ Enhanced LinkedIn extraction failed: {e}")
                base_data["enhanced_linkedin"] = {}
        
        return base_data
    
    def _analyze_disc_profile(self, lead_data: Dict[str, str]) -> Dict[str, float]:
        """DISC profili analizi - Gerçek psikolojik hesaplama"""
        
        job_title = lead_data.get('job_title', '').lower()
        industry = lead_data.get('industry', '').lower()
        company = lead_data.get('company', '').lower()
        first_name = lead_data.get('first_name', '').lower()
        
        # Data kalitesini kontrol et
        has_job_title = bool(job_title.strip())
        has_industry = bool(industry.strip()) 
        has_company = bool(company.strip())
        has_name = bool(first_name.strip())
        
        # Data yoksa daha realistic default profile (biraz varyasyon)
        if not any([has_job_title, has_industry, has_company]):
            # Minimal data için balanced ama realistic profile
            scores = {"D": 28.0, "I": 32.0, "S": 22.0, "C": 18.0}  # Slightly I-leaning profile
        else:
            # Başlangıç skorları (data varsa)
            scores = {"D": 35.0, "I": 35.0, "S": 35.0, "C": 35.0}
        
        # İş unvanına göre güçlü ayarlamalar
        if any(title in job_title for title in ['ceo', 'cto', 'founder', 'director', 'president', 'vp']):
            scores["D"] += 40  # Strong dominance
            scores["I"] += 20  # Leadership communication
            scores["S"] -= 10  # Less steady, more dynamic
            scores["C"] += 15  # Strategic thinking
            
        elif any(title in job_title for title in ['manager', 'lead', 'head', 'supervisor']):
            scores["D"] += 30  # Moderate dominance
            scores["I"] += 15  # Team leadership
            scores["S"] += 10  # Team support
            scores["C"] += 10  # Organization
            
        elif any(title in job_title for title in ['sales', 'business development', 'account executive', 'account manager']):
            scores["I"] += 45  # Strong influence
            scores["D"] += 25  # Results drive
            scores["S"] += 10  # Relationship support
            scores["C"] -= 5   # Less detail-focused
            
        elif any(title in job_title for title in ['marketing', 'brand', 'communication', 'pr']):
            scores["I"] += 35  # Creative influence
            scores["D"] += 15  # Campaign drive
            scores["S"] += 15  # Team collaboration
            scores["C"] += 20  # Creative precision
            
        elif any(title in job_title for title in ['engineer', 'developer', 'programmer', 'architect', 'tech', 'surveyor']):
            scores["C"] += 45  # Strong analytical
            scores["D"] += 10  # Problem-solving drive
            scores["I"] -= 10  # Less social focus
            scores["S"] += 20  # Methodical approach
            
        elif any(title in job_title for title in ['analyst', 'researcher', 'scientist', 'data']):
            scores["C"] += 50  # Highest analytical
            scores["D"] += 5   # Research determination
            scores["I"] -= 15  # Independent work
            scores["S"] += 15  # Systematic approach
            
        elif any(title in job_title for title in ['support', 'service', 'customer success', 'success manager']):
            scores["S"] += 40  # Strong support orientation
            scores["I"] += 25  # Customer interaction
            scores["C"] += 20  # Process following
            scores["D"] -= 5   # Less aggressive
            
        elif any(title in job_title for title in ['hr', 'people', 'talent', 'recruiting']):
            scores["S"] += 35  # People support
            scores["I"] += 30  # People interaction
            scores["C"] += 15  # Process compliance
            scores["D"] += 10  # Decision making
            
        elif any(title in job_title for title in ['finance', 'accounting', 'controller', 'cfo']):
            scores["C"] += 40  # Financial precision
            scores["D"] += 20  # Financial control
            scores["S"] += 15  # Steady processes
            scores["I"] -= 5   # Less social focus
            
        # Endüstri ayarlamaları
        if any(ind in industry for ind in ['tech', 'software', 'startup', 'saas']):
            scores["D"] += 20  # Fast-paced environment
            scores["I"] += 10  # Innovation communication
            scores["C"] += 15  # Technical precision
            
        elif any(ind in industry for ind in ['finance', 'banking', 'insurance', 'investment']):
            scores["C"] += 25  # Regulatory compliance
            scores["D"] += 15  # Financial decisions
            scores["S"] += 15  # Risk management
            
        elif any(ind in industry for ind in ['healthcare', 'medical', 'pharma']):
            scores["C"] += 30  # Medical precision
            scores["S"] += 25  # Patient care
            scores["I"] += 10  # Patient communication
            
        elif any(ind in industry for ind in ['consulting', 'advisory', 'professional services']):
            scores["I"] += 25  # Client interaction
            scores["D"] += 20  # Client leadership
            scores["C"] += 20  # Analytical solutions
            
        elif any(ind in industry for ind in ['construction', 'building', 'real estate', 'property']):
            scores["C"] += 30  # Precision and compliance
            scores["D"] += 20  # Project leadership
            scores["S"] += 15  # Safety and processes
            scores["I"] += 5   # Client communication
            
        # Company size indicators (if available)
        if any(comp in company for comp in ['google', 'microsoft', 'apple', 'amazon', 'meta', 'netflix']):
            scores["D"] += 15  # Big tech drive
            scores["C"] += 20  # Technical excellence
            
        elif any(comp in company for comp in ['mckinsey', 'bcg', 'bain', 'deloitte', 'pwc']):
            scores["D"] += 25  # Consulting leadership
            scores["I"] += 20  # Client communication
            scores["C"] += 25  # Analytical rigor
            
        # İsim-based psychological indicators (opsiyonel, kültürel)
        if first_name:
            if len(first_name) <= 4:  # Shorter names often correlate with directness
                scores["D"] += 5
            if any(name_part in first_name for name_part in ['alex', 'mike', 'john', 'david']):
                scores["D"] += 8  # Traditionally strong names
                
        # Enhanced LinkedIn data'sından DISC hesaplama
        enhanced_linkedin = lead_data.get('enhanced_linkedin', {})
        if enhanced_linkedin and not enhanced_linkedin.get('error'):
            personality_indicators = enhanced_linkedin.get('personality_indicators', {})
            
            if personality_indicators.get('leadership_signals', False):
                scores["D"] += 20
            if personality_indicators.get('team_oriented', False):
                scores["S"] += 15
            if personality_indicators.get('achievement_focused', False):
                scores["D"] += 15
                scores["C"] += 10
            if personality_indicators.get('detail_oriented', False):
                scores["C"] += 20
            if personality_indicators.get('innovation_focused', False):
                scores["I"] += 15
                scores["D"] += 10
            if personality_indicators.get('customer_focused', False):
                scores["I"] += 10
                scores["S"] += 15
                
            # Communication style'dan DISC çıkarımları
            communication_style = enhanced_linkedin.get('communication_style', {})
            writing_tone = communication_style.get('writing_tone', 'neutral')
            
            if writing_tone == 'assertive':
                scores["D"] += 15
            elif writing_tone == 'friendly':
                scores["I"] += 15
            elif writing_tone == 'supportive':
                scores["S"] += 15
            elif writing_tone == 'analytical':
                scores["C"] += 15
                
            if communication_style.get('action_orientation', 0) > 5:
                scores["D"] += 10
            if communication_style.get('quantitative_focus', 0) > 3:
                scores["C"] += 10
        
        # Minimum/maximum sınırları
        for key in scores:
            scores[key] = max(15.0, min(85.0, scores[key]))
            
        # Normalize to 100% (but maintain variation)
        total = sum(scores.values())
        if total > 0:
            scores = {k: round((v / total) * 100, 1) for k, v in scores.items()}
            
        return scores
    
    def _analyze_big_five(self, lead_data: Dict[str, str]) -> Dict[str, float]:
        """Big Five kişilik analizi"""
        
        job_title = lead_data.get('job_title', '').lower()
        industry = lead_data.get('industry', '').lower()
        
        # Temel skorlar
        scores = {
            "openness": 60.0,
            "conscientiousness": 65.0,
            "extraversion": 55.0,
            "agreeableness": 60.0,
            "neuroticism": 40.0
        }
        
        # İş rolüne göre ayarlamalar
        if any(title in job_title for title in ['ceo', 'founder', 'entrepreneur']):
            scores["openness"] += 20
            scores["extraversion"] += 25
            scores["neuroticism"] -= 15
            
        if any(title in job_title for title in ['engineer', 'developer', 'programmer']):
            scores["conscientiousness"] += 20
            scores["openness"] += 15
            scores["extraversion"] -= 10
            
        if any(title in job_title for title in ['sales', 'marketing']):
            scores["extraversion"] += 30
            scores["agreeableness"] += 15
            
        # Sınırları kontrol et
        for key in scores:
            scores[key] = max(20, min(95, scores[key]))
            
        return {k: round(v, 1) for k, v in scores.items()}
    
    def _determine_personality_type(self, disc_scores: Dict[str, float], big_five: Dict[str, float]) -> str:
        """Ana kişilik tipini belirle"""
        
        # En yüksek DISC skoru
        dominant_disc = max(disc_scores, key=disc_scores.get)
        
        # İkincil özellikler
        sorted_disc = sorted(disc_scores.items(), key=lambda x: x[1], reverse=True)
        secondary = sorted_disc[1][0] if len(sorted_disc) > 1 else ""
        
        # Tip kombinasyonu
        if disc_scores[dominant_disc] > 60:
            return f"{dominant_disc}{secondary}"
        else:
            return dominant_disc
    
    def _analyze_communication_style(self, lead_data: Dict[str, str], personality_type: str) -> Dict[str, Any]:
        """İletişim tarzı analizi"""
        
        primary_type = personality_type[0]
        
        style_mapping = {
            "D": {
                "primary_style": "direct",
                "preferences": ["Brief and to-the-point", "Results-focused", "Fast-paced"],
                "internal_recommendations": [
                    "Get straight to business",
                    "Focus on outcomes and ROI",
                    "Avoid lengthy explanations"
                ]
            },
            "I": {
                "primary_style": "enthusiastic",
                "preferences": ["Collaborative", "Relationship-focused", "Energetic"],
                "internal_recommendations": [
                    "Start with relationship building",
                    "Use enthusiasm and energy",
                    "Include social proof and testimonials"
                ]
            },
            "S": {
                "primary_style": "supportive",
                "preferences": ["Patient", "Steady pace", "Detailed explanations"],
                "internal_recommendations": [
                    "Take time to build trust",
                    "Provide step-by-step information",
                    "Emphasize stability and security"
                ]
            },
            "C": {
                "primary_style": "analytical",
                "preferences": ["Data-driven", "Detailed", "Logical"],
                "internal_recommendations": [
                    "Provide comprehensive data",
                    "Use logical reasoning",
                    "Include case studies and research"
                ]
            }
        }
        
        return style_mapping.get(primary_type, style_mapping["D"])
    
    def _generate_sales_intelligence(self, personality_type: str, lead_data: Dict[str, str]) -> Dict[str, Any]:
        """Satış stratejisi oluştur"""
        
        primary_type = personality_type[0]
        
        intelligence_mapping = {
            "D": {
                "primary_approach": "Results-focused direct approach",
                "presentation_style": "Executive summary with key benefits",
                "closing_technique": "Assumptive close with clear next steps",
                "objection_handling": "Address concerns directly with solutions",
                "follow_up_style": "Brief, action-oriented follow-ups",
                "meeting_recommendations": {
                    "optimal_duration": "30-45 minutes",
                    "best_time": "Morning (9-11 AM)",
                    "preparation_tips": [
                        "Prepare executive summary",
                        "Focus on ROI and outcomes",
                        "Have implementation timeline ready"
                    ],
                    "agenda_style": "Structured with clear objectives"
                },
                "email_guidelines": {
                    "subject_line_style": "Direct and benefit-focused",
                    "message_length": "Short and concise (under 150 words)",
                    "tone": "Professional and authoritative",
                    "call_to_action": "Clear, single action item"
                },
                "negotiation_strategy": {
                    "approach": "Direct negotiation with win-win focus",
                    "concession_strategy": "Limited concessions with value justification",
                    "decision_timeline": "Quick decision-making (1-2 weeks)"
                },
                "likely_objections": ["Cost concerns", "Implementation time", "Risk factors"],
                "key_motivators": ["Efficiency gains", "Competitive advantage", "Results achievement"],
                "decision_making_style": "Quick, data-informed decisions"
            },
            "I": {
                "primary_approach": "Relationship-building collaborative approach",
                "presentation_style": "Interactive presentation with stories",
                "closing_technique": "Collaborative close with mutual agreement",
                "objection_handling": "Listen empathetically and find solutions together",
                "follow_up_style": "Personalized, relationship-focused follow-ups",
                "meeting_recommendations": {
                    "optimal_duration": "60-90 minutes",
                    "best_time": "Late morning (10 AM-12 PM)",
                    "preparation_tips": [
                        "Research their interests and background",
                        "Prepare success stories and testimonials",
                        "Plan interactive elements"
                    ],
                    "agenda_style": "Flexible with discussion opportunities"
                },
                "email_guidelines": {
                    "subject_line_style": "Personal and engaging",
                    "message_length": "Medium length with personality (150-250 words)",
                    "tone": "Warm and enthusiastic",
                    "call_to_action": "Inviting conversation starter"
                },
                "negotiation_strategy": {
                    "approach": "Collaborative negotiation with relationship focus",
                    "concession_strategy": "Mutual concessions with added value",
                    "decision_timeline": "Moderate decision-making (2-4 weeks)"
                },
                "likely_objections": ["Team alignment", "Change management", "Social proof needs"],
                "key_motivators": ["Team success", "Recognition", "Collaborative benefits"],
                "decision_making_style": "Consensus-building with team input"
            },
            "S": {
                "primary_approach": "Trust-building steady approach",
                "presentation_style": "Detailed presentation with step-by-step explanation",
                "closing_technique": "Supportive close with reassurance",
                "objection_handling": "Patient listening with thorough explanations",
                "follow_up_style": "Consistent, supportive follow-ups",
                "meeting_recommendations": {
                    "optimal_duration": "60-75 minutes",
                    "best_time": "Mid-morning (10-11 AM)",
                    "preparation_tips": [
                        "Prepare detailed information packets",
                        "Include implementation support details",
                        "Have reference customers ready"
                    ],
                    "agenda_style": "Detailed agenda with clear structure"
                },
                "email_guidelines": {
                    "subject_line_style": "Clear and informative",
                    "message_length": "Detailed and comprehensive (200-300 words)",
                    "tone": "Supportive and reassuring",
                    "call_to_action": "Low-pressure next step"
                },
                "negotiation_strategy": {
                    "approach": "Patient negotiation with stability focus",
                    "concession_strategy": "Gradual concessions with value demonstration",
                    "decision_timeline": "Careful decision-making (4-8 weeks)"
                },
                "likely_objections": ["Change concerns", "Support questions", "Stability issues"],
                "key_motivators": ["Security", "Support quality", "Proven solutions"],
                "decision_making_style": "Careful, consensus-based decisions"
            },
            "C": {
                "primary_approach": "Data-driven analytical approach",
                "presentation_style": "Comprehensive presentation with detailed analysis",
                "closing_technique": "Logical close with data support",
                "objection_handling": "Detailed responses with supporting evidence",
                "follow_up_style": "Information-rich, systematic follow-ups",
                "meeting_recommendations": {
                    "optimal_duration": "90-120 minutes",
                    "best_time": "Morning (9-10 AM)",
                    "preparation_tips": [
                        "Prepare comprehensive data analysis",
                        "Include technical specifications",
                        "Have comparison charts ready"
                    ],
                    "agenda_style": "Detailed agenda with technical deep-dives"
                },
                "email_guidelines": {
                    "subject_line_style": "Specific and data-focused",
                    "message_length": "Comprehensive with details (250-400 words)",
                    "tone": "Professional and analytical",
                    "call_to_action": "Detailed information request"
                },
                "negotiation_strategy": {
                    "approach": "Analytical negotiation with detailed justification",
                    "concession_strategy": "Data-justified concessions",
                    "decision_timeline": "Thorough decision-making (6-12 weeks)"
                },
                "likely_objections": ["Technical concerns", "Data accuracy", "Implementation details"],
                "key_motivators": ["Quality assurance", "Technical excellence", "Detailed planning"],
                "decision_making_style": "Analytical, research-based decisions"
            }
        }
        
        return intelligence_mapping.get(primary_type, intelligence_mapping["D"])
    
    def _generate_behavioral_predictions(self, personality_type: str) -> Dict[str, str]:
        """Davranışsal tahminler"""
        
        primary_type = personality_type[0]
        
        predictions = {
            "D": {
                "work_style": "Results-oriented, fast-paced, goal-driven",
                "stress_response": "Direct confrontation, seeks immediate solutions",
                "team_role": "Natural leader, decision-maker, drives initiatives",
                "leadership_style": "Directive leadership with clear expectations"
            },
            "I": {
                "work_style": "Collaborative, people-focused, enthusiastic",
                "stress_response": "Seeks social support, talks through problems",
                "team_role": "Team motivator, relationship builder, idea generator",
                "leadership_style": "Inspirational leadership with team engagement"
            },
            "S": {
                "work_style": "Steady, methodical, supportive of others",
                "stress_response": "Withdraws to process, seeks stability",
                "team_role": "Reliable team member, supportive colleague, mediator",
                "leadership_style": "Supportive leadership with team development focus"
            },
            "C": {
                "work_style": "Analytical, detail-oriented, quality-focused",
                "stress_response": "Analyzes thoroughly, seeks more information",
                "team_role": "Quality controller, problem solver, technical expert",
                "leadership_style": "Analytical leadership with systematic approach"
            }
        }
        
        return predictions.get(primary_type, predictions["D"])
    
    def _identify_strengths(self, personality_type: str, disc_scores: Dict[str, float]) -> List[str]:
        """Güçlü yanları belirle"""
        
        primary_type = personality_type[0]
        
        strength_mapping = {
            "D": ["Leadership", "Decision-making", "Results focus", "Problem-solving", "Initiative"],
            "I": ["Communication", "Team building", "Persuasion", "Enthusiasm", "Relationship building"],
            "S": ["Reliability", "Patience", "Support", "Teamwork", "Stability"],
            "C": ["Attention to detail", "Quality focus", "Analysis", "Planning", "Accuracy"]
        }
        
        base_strengths = strength_mapping.get(primary_type, [])
        
        # İkincil güçleri ekle
        sorted_disc = sorted(disc_scores.items(), key=lambda x: x[1], reverse=True)
        if len(sorted_disc) > 1 and sorted_disc[1][1] > 40:
            secondary_strengths = strength_mapping.get(sorted_disc[1][0], [])
            base_strengths.extend(secondary_strengths[:2])
        
        return list(set(base_strengths))
    
    def _calculate_confidence_score(self, lead_data: Dict[str, Any]) -> float:
        """Analiz güven skorunu hesapla - Enhanced LinkedIn data ile artırılmış"""
        
        score = 0.5  # Temel skor
        
        # Temel veri noktalarına göre artır
        if lead_data.get('job_title'):
            score += 0.12  # Job title önemli ama enhanced data'ya yer açmak için azaltıldı
        if lead_data.get('company'):
            score += 0.08
        if lead_data.get('industry'):
            score += 0.08
        if lead_data.get('linkedin_url'):
            score += 0.05  # Sadece URL varsa düşük puan
        if lead_data.get('email'):
            score += 0.05
        
        # Enhanced LinkedIn data varsa büyük bonus!
        enhanced_linkedin = lead_data.get('enhanced_linkedin', {})
        if enhanced_linkedin and not enhanced_linkedin.get('error'):
            score += 0.15  # Enhanced data varlığı için büyük bonus
            
            # Enhanced data kalitesine göre ek bonus
            data_quality = enhanced_linkedin.get('data_quality', {})
            extraction_confidence = data_quality.get('extraction_confidence', 0.0)
            
            if extraction_confidence >= 0.8:
                score += 0.10  # Yüksek kaliteli data için bonus
            elif extraction_confidence >= 0.6:
                score += 0.07  # Orta kaliteli data için orta bonus
            elif extraction_confidence >= 0.4:
                score += 0.05  # Düşük kaliteli data için küçük bonus
            
            # Specific data points bonuses
            personality_indicators = enhanced_linkedin.get('personality_indicators', {})
            if personality_indicators:
                score += 0.05  # Kişilik göstergeleri varsa
                
            communication_style = enhanced_linkedin.get('communication_style', {})
            if communication_style:
                score += 0.05  # İletişim tarzı analizi varsa
        
        return round(min(0.98, score), 2)  # Max 98% confidence
    
    def _get_personality_description(self, personality_type: str) -> str:
        """Kişilik tipi açıklaması"""
        
        descriptions = {
            "D": "Dominant - Direct, results-oriented, and decisive leader",
            "I": "Influential - Interactive, optimistic, and people-focused",
            "S": "Steady - Stable, patient, and team-oriented supporter",
            "C": "Conscientious - Compliant, accurate, and quality-focused analyst"
        }
        
        primary_type = personality_type[0]
        return descriptions.get(primary_type, "Mixed personality type with balanced traits")
    
    def _get_data_sources(self, lead_data: Dict[str, str]) -> List[str]:
        """Analiz için kullanılan veri kaynaklarını listele"""
        
        sources = ["Internal AI Analysis"]
        
        if lead_data.get('job_title'):
            sources.append("Job Title Analysis")
        if lead_data.get('industry'):
            sources.append("Industry Pattern Analysis")
        if lead_data.get('company'):
            sources.append("Company Profile Analysis")
        if lead_data.get('linkedin_url'):
            sources.append("LinkedIn Profile Pattern")
            
        return sources
    
    def _load_disc_profiles(self):
        """DISC profil veri tabanını yükle"""
        # Bu gerçek implementasyonda bir veritabanından gelecek
        return {}
    
    def _load_big_five_mapping(self):
        """Big Five haritalama verilerini yükle"""
        return {}
    
    def _load_industry_patterns(self):
        """Endüstri desenlerini yükle"""
        return {}
    
    def _load_job_title_patterns(self):
        """İş unvanı desenlerini yükle"""
        return {}
    
    def _extract_enhanced_insights(self, lead_data: Dict[str, Any]) -> Dict[str, Any]:
        """Enhanced LinkedIn data'sından psikolojik insights çıkar"""
        try:
            enhanced_linkedin = lead_data.get('enhanced_linkedin', {})
            if not enhanced_linkedin:
                return {}
            
            insights = {}
            
            # Personality indicators analysis
            personality_indicators = enhanced_linkedin.get('personality_indicators', {})
            if personality_indicators:
                insights['linkedin_personality_signals'] = {
                    'achievement_oriented': personality_indicators.get('achievement_focused', False),
                    'team_player': personality_indicators.get('team_oriented', False),
                    'innovative_mindset': personality_indicators.get('innovation_focused', False),
                    'detail_focused': personality_indicators.get('detail_oriented', False),
                    'leadership_traits': personality_indicators.get('leadership_signals', False),
                    'customer_centric': personality_indicators.get('customer_focused', False)
                }
            
            # Communication style analysis
            communication_style = enhanced_linkedin.get('communication_style', {})
            if communication_style:
                insights['communication_intelligence'] = {
                    'writing_tone': communication_style.get('writing_tone', 'neutral'),
                    'complexity_level': communication_style.get('sentence_complexity', 'moderate'),
                    'action_oriented': communication_style.get('action_orientation', 0) > 5,
                    'data_driven': communication_style.get('quantitative_focus', 0) > 3,
                    'professional_language': communication_style.get('professional_language', 'standard')
                }
            
            # Professional behavior patterns
            professional_behavior = enhanced_linkedin.get('professional_behavior', {})
            if professional_behavior:
                insights['career_intelligence'] = {
                    'job_stability': professional_behavior.get('job_tenure_pattern', 'stable'),
                    'career_progression': professional_behavior.get('career_progression', 'upward'),
                    'industry_focus': professional_behavior.get('industry_consistency', 'consistent'),
                    'company_preference': professional_behavior.get('company_size_preference', 'mixed')
                }
            
            # Network analysis
            network_analysis = enhanced_linkedin.get('network_analysis', {})
            if network_analysis:
                insights['networking_intelligence'] = {
                    'connection_count': network_analysis.get('connection_count', 500),
                    'network_quality': network_analysis.get('network_quality_indicators', 'professional'),
                    'industry_diversity': network_analysis.get('industry_diversity', 'diverse'),
                    'influencer_connections': network_analysis.get('influencer_connections', False)
                }
            
            # Data quality assessment
            data_quality = enhanced_linkedin.get('data_quality', {})
            insights['extraction_quality'] = {
                'confidence': data_quality.get('extraction_confidence', 0.0),
                'profile_completeness': data_quality.get('profile_completeness', 0.0),
                'content_richness': data_quality.get('content_richness', 0.0)
            }
            
            return insights
            
        except Exception as e:
            logger.error(f"Enhanced insights extraction error: {e}")
            return {"error": "Failed to extract enhanced insights"} 