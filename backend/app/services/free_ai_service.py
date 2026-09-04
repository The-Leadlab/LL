import asyncio
import httpx
import json
import logging
import os
from typing import Dict, Any, Optional, List
from datetime import datetime
from .enhanced_personality_service import enhanced_personality_service

logger = logging.getLogger(__name__)

class FreeAIService:
    """
    Ücretsiz AI sağlayıcılarını kullanan AI servis
    
    Desteklenen providers:
    1. Google Gemini (ücretsiz tier)
    2. Hugging Face Inference API (ücretsiz)
    3. Rule-based fallback
    """
    
    def __init__(self):
        self.gemini_api_key = os.getenv("GEMINI_API_KEY")
        self.hf_api_key = os.getenv("HUGGINGFACE_API_KEY")
        self.timeout = 30.0
        
    async def analyze_lead_personality(self, lead_data: Dict[str, Any]) -> Dict[str, Any]:
        """Analyze lead's personality"""
        
        # Try Gemini first
        try:
            if self.gemini_api_key:
                result = await self._analyze_with_gemini(lead_data)
                if result:
                    result["provider"] = "gemini"
                    return result
        except Exception as e:
            logger.warning(f"Gemini analysis failed: {str(e)}")
        
        # Then try Hugging Face
        try:
            if self.hf_api_key:
                result = await self._analyze_with_huggingface(lead_data)
                if result:
                    result["provider"] = "huggingface"
                    return result
        except Exception as e:
            logger.warning(f"Hugging Face analysis failed: {str(e)}")
        
        # Finally, rule-based fallback
        logger.info("Using rule-based fallback for lead analysis")
        result = self._analyze_with_rules(lead_data)
        result["provider"] = "rule_based"
        return result
    
    async def _analyze_with_gemini(self, lead_data: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """Analysis with Google Gemini"""
        
        if not self.gemini_api_key:
            return None
            
        prompt = self._create_analysis_prompt(lead_data)
        
        url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent"
        headers = {
            "Content-Type": "application/json",
            "x-goog-api-key": self.gemini_api_key
        }
        
        payload = {
            "contents": [{
                "parts": [{
                    "text": prompt
                }]
            }],
            "generationConfig": {
                "temperature": 0.3,
                "maxOutputTokens": 1000
            }
        }
        
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            response = await client.post(url, headers=headers, json=payload)
            
            if response.status_code == 200:
                data = response.json()
                text = data.get("candidates", [{}])[0].get("content", {}).get("parts", [{}])[0].get("text", "")
                return self._parse_ai_response(text)
            else:
                logger.error(f"Gemini API error: {response.status_code} - {response.text}")
                return None
    
    async def _analyze_with_huggingface(self, lead_data: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """Analysis with Hugging Face"""
        
        if not self.hf_api_key:
            return None
            
        # Ücretsiz model kullan
        model_url = "https://api-inference.huggingface.co/models/microsoft/DialoGPT-medium"
        headers = {"Authorization": f"Bearer {self.hf_api_key}"}
        
        prompt = self._create_simple_prompt(lead_data)
        payload = {"inputs": prompt}
        
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            response = await client.post(model_url, headers=headers, json=payload)
            
            if response.status_code == 200:
                data = response.json()
                if isinstance(data, list) and len(data) > 0:
                    text = data[0].get("generated_text", "")
                    return self._parse_ai_response(text)
            else:
                logger.error(f"Hugging Face API error: {response.status_code}")
                return None
    
    def _analyze_with_rules(self, lead_data: Dict[str, Any]) -> Dict[str, Any]:
        """Enhanced rule-based analysis using Crystal Knows style system"""
        
        # Use enhanced personality service for real personality insights
        enhanced_result = enhanced_personality_service.analyze_personality(lead_data)
        
        # Convert to expected format
        communication_styles = enhanced_result.get("communication_style", ["direct"])
        communication_style_str = ", ".join(communication_styles) if isinstance(communication_styles, list) else str(communication_styles)
        
        return {
            "disc_profile": enhanced_result.get("disc_profile", "D"),
            "personality_type": enhanced_result.get("personality_type", "D"),
            "traits": enhanced_result.get("traits", ["results-oriented", "decisive"]),
            "communication_style": communication_style_str,
            "sales_approach": enhanced_result.get("sales_approach", "Results-oriented approach"),
            "confidence": enhanced_result.get("confidence", 0.75),
            "analysis_method": "enhanced_rule_based",
            "disc_scores": enhanced_result.get("disc_scores", {}),
            "analysis_factors": enhanced_result.get("analysis_factors", {})
        }
    
    def _create_analysis_prompt(self, lead_data: Dict[str, Any]) -> str:
        """AI için detaylı prompt oluştur"""
        
        job_title = lead_data.get("job_title", "Unknown")
        company = lead_data.get("company", "Unknown")
        industry = lead_data.get("industry", "Unknown")
        
        return f"""
        Analyze this business lead and provide insights in JSON format:

        Lead Information:
        - Job Title: {job_title}
        - Company: {company}  
        - Industry: {industry}

        Please provide analysis in this exact JSON format:
        {{
            "disc_profile": "D/I/S/C combination",
            "personality_type": "Primary DISC type (D/I/S/C)",
            "traits": ["trait1", "trait2", "trait3"],
            "communication_style": "preferred communication style",
            "sales_approach": "recommended sales approach",
            "confidence": 0.85
        }}

        Focus on DISC personality analysis based on typical traits for this role and industry.
        """
    
    def _create_simple_prompt(self, lead_data: Dict[str, Any]) -> str:
        """Basit prompt oluştur"""
        job_title = lead_data.get("job_title", "Professional")
        return f"Analyze personality type for {job_title} role. DISC profile:"
    
    def _parse_ai_response(self, text: str) -> Dict[str, Any]:
        """AI yanıtını parse et"""
        
        try:
            # JSON bul ve parse et
            start = text.find('{')
            end = text.rfind('}') + 1
            
            if start != -1 and end != -1:
                json_str = text[start:end]
                return json.loads(json_str)
        except:
            pass
        
        # If JSON parsing fails, use rule-based fallback
        return {
            "disc_profile": "D",
            "personality_type": "D",
            "traits": ["results-oriented", "decisive", "confident"],
            "communication_style": "direct and brief",
            "sales_approach": "focus on results and efficiency",
            "confidence": 0.3
        }
    
    def _predict_disc_profile(self, job_title: str, company: str, industry: str) -> str:
        """İş unvanına göre DISC profil tahmini"""
        
        if any(word in job_title for word in ["ceo", "director", "manager", "head", "chief"]):
            return "DC"  # Directive + Compliant
        elif any(word in job_title for word in ["sales", "marketing", "business development"]):
            return "DI"  # Directive + Influential
        elif any(word in job_title for word in ["hr", "people", "customer", "support"]):
            return "SI"  # Steady + Influential  
        elif any(word in job_title for word in ["analyst", "engineer", "developer", "technical"]):
            return "CS"  # Compliant + Steady
        else:
            return "D"   # Default
    
    def _predict_personality_traits(self, disc_profile: str, job_title: str) -> List[str]:
        """Predict personality traits based on DISC profile"""
        
        traits_map = {
            "D": ["results-oriented", "decisive", "confident", "competitive"],
            "I": ["outgoing", "enthusiastic", "persuasive", "optimistic"],
            "S": ["patient", "loyal", "supportive", "reliable"],
            "C": ["analytical", "detail-oriented", "systematic", "quality-focused"]
        }
        
        primary = disc_profile[0] if disc_profile else "D"
        return traits_map.get(primary, traits_map["D"])
    
    def _predict_communication_style(self, disc_profile: str) -> str:
        """DISC profiline göre iletişim stili"""
        
        style_map = {
            "D": "direct and brief",
            "I": "friendly and enthusiastic", 
            "S": "patient and supportive",
            "C": "detailed and factual"
        }
        
        primary = disc_profile[0] if disc_profile else "D"
        return style_map.get(primary, "professional")
    
    def _predict_sales_approach(self, disc_profile: str, job_title: str) -> str:
        """Sales approach based on DISC profile"""
        
        approach_map = {
            "D": "Focus on results, ROI, and efficiency. Be direct and time-conscious.",
            "I": "Build rapport, use social proof, and emphasize collaboration benefits.",
            "S": "Provide support, demonstrate reliability, and emphasize stability.",
            "C": "Present detailed information, provide evidence, and focus on quality."
        }
        
        primary = disc_profile[0] if disc_profile else "D"
        return approach_map.get(primary, "Professional approach with clear value proposition.")

    async def rewrite_email(
        self,
        *,
        subject: str,
        body: str,
        instruction: str,
        lead_data: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """Rewrite outreach email subject/body. Falls back to lightly annotated original."""
        lead_data = lead_data or {}
        prompt = (
            f"Rewrite this cold outreach email.\n"
            f"Instruction: {instruction}\n"
            f"Lead context: {json.dumps(lead_data)[:800]}\n"
            f"Current subject: {subject}\n"
            f"Current body:\n{body}\n\n"
            'Respond ONLY with JSON: {"subject": "...", "body": "..."}\n'
            "Keep merge tokens like {{first_name}} unchanged.\n"
        )
        try:
            if self.gemini_api_key:
                url = "https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent"
                headers = {"Content-Type": "application/json", "x-goog-api-key": self.gemini_api_key}
                payload = {
                    "contents": [{"parts": [{"text": prompt}]}],
                    "generationConfig": {"temperature": 0.4, "maxOutputTokens": 1200},
                }
                async with httpx.AsyncClient(timeout=self.timeout) as client:
                    response = await client.post(url, headers=headers, json=payload)
                if response.status_code == 200:
                    data = response.json()
                    text = (
                        data.get("candidates", [{}])[0]
                        .get("content", {})
                        .get("parts", [{}])[0]
                        .get("text", "")
                    )
                    start = text.find("{")
                    end = text.rfind("}") + 1
                    if start >= 0 and end > start:
                        parsed = json.loads(text[start:end])
                        return {
                            "subject": str(parsed.get("subject") or subject),
                            "body": str(parsed.get("body") or body),
                            "provider": "gemini",
                        }
        except Exception as e:
            logger.warning("AI rewrite failed: %s", e)

        return {
            "subject": subject,
            "body": (f"({instruction.strip()})\n\n{body}" if instruction else body),
            "provider": "passthrough",
        }


# Global instance
free_ai_service = FreeAIService()
 