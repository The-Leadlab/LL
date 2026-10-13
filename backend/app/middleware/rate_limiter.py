from fastapi import Request, HTTPException
from app.core.cache import MySQLCache
from datetime import datetime, timedelta
from typing import Dict, Optional
import time

class RateLimiter:
    def __init__(self):
        self.cache = MySQLCache()
        self.rate_limits = {
            "/api/v1/auth/register": 5,  # signup is tighter than general auth
            "/api/v1/leads/": 100,     # 100 request/minute
            "/api/v1/auth/": 20,       # 20 request/minute
            "/api/v1/ml/": 50,         # 50 request/minute
            "/api/v1/psychometrics/": 30,  # 30 request/minute
            "/api/v1/tokens/": 40,      # 40 request/minute
            "default": 200              # default limit
        }
        self.window_size = 60  # 1 minute window

    def _get_rate_limit_key(self, client_ip: str, path: str) -> str:
        """Rate limit için cache key oluştur"""
        return f"rate_limit:{client_ip}:{path}"

    def _get_limit_for_path(self, path: str) -> int:
        """Path için limit değerini al"""
        for prefix, limit in self.rate_limits.items():
            if path.startswith(prefix):
                return limit
        return self.rate_limits["default"]

    def _get_current_window(self) -> int:
        """Şu anki zaman penceresini al"""
        return int(time.time() / self.window_size)

    async def check_rate_limit(self, request: Request):
        """Rate limit kontrolü"""
        try:
            # Client IP ve path
            client_ip = request.client.host
            path = request.url.path
            
            # Limit ve key
            limit = self._get_limit_for_path(path)
            current_window = self._get_current_window()
            key = self._get_rate_limit_key(client_ip, path)
            
            # Cache'den mevcut durumu al
            cache_data = self.cache.get(key)
            if cache_data is None:
                cache_data = {"window": current_window, "count": 0}
            
            # Pencere değişmişse sıfırla
            if cache_data["window"] != current_window:
                cache_data = {"window": current_window, "count": 0}
            
            # İstek sayısını artır
            cache_data["count"] += 1
            
            # Cache'i güncelle
            self.cache.set(
                key=key,
                value=cache_data,
                expire=self.window_size * 2  # 2 pencere boyunca tut
            )
            
            # Limit kontrolü
            if cache_data["count"] > limit:
                reset_time = (current_window + 1) * self.window_size
                reset_seconds = reset_time - int(time.time())
                
                raise HTTPException(
                    status_code=429,
                    detail={
                        "error": "Too many requests",
                        "limit": limit,
                        "reset_in_seconds": reset_seconds,
                        "retry_after": datetime.fromtimestamp(reset_time).isoformat()
                    }
                )
            
            # Rate limit header'ları
            request.state.rate_limit = {
                "limit": limit,
                "remaining": limit - cache_data["count"],
                "reset": (current_window + 1) * self.window_size
            }
            
        except HTTPException:
            raise
        except Exception as e:
            # Hata durumunda isteğe izin ver
            request.state.rate_limit = {
                "limit": 0,
                "remaining": 0,
                "reset": 0
            }

    async def add_headers(self, request: Request, response):
        """Rate limit header'larını ekle"""
        if hasattr(request.state, "rate_limit"):
            rate_limit = request.state.rate_limit
            response.headers["X-RateLimit-Limit"] = str(rate_limit["limit"])
            response.headers["X-RateLimit-Remaining"] = str(rate_limit["remaining"])
            response.headers["X-RateLimit-Reset"] = str(rate_limit["reset"])