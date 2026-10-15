from fastapi import APIRouter, HTTPException, Depends
from fastapi.responses import HTMLResponse
from typing import List, Dict, Any
import json
from pathlib import Path
from datetime import datetime, timedelta
from app.api.deps import get_current_user
from app.models.user import User

def read_log_file(file_path: Path, hours: int = 24) -> List[Dict[str, Any]]:
    """Belirtilen süre içindeki log kayıtlarını okur"""
    cutoff_time = datetime.now() - timedelta(hours=hours)
    entries = []
    
    if file_path.exists():
        with open(file_path, 'r') as f:
            for line in f:
                try:
                    # Log satırını parse et
                    timestamp_str = line.split(' - ')[0]
                    timestamp = datetime.strptime(timestamp_str, '%Y-%m-%d %H:%M:%S,%f')
                    
                    if timestamp >= cutoff_time:
                        # JSON verisini çıkar
                        json_str = ' - '.join(line.split(' - ')[1:])
                        data = json.loads(json_str)
                        data['timestamp'] = timestamp_str
                        entries.append(data)
                except:
                    continue
    
    return entries

def generate_monitoring_html(errors: List[Dict], access_logs: List[Dict], performance_logs: List[Dict]) -> str:
    """Generate monitoring dashboard HTML"""
    total_errors = len(errors)
    total_requests = len(access_logs)
    avg_response_time = sum(log.get('execution_time', 0) for log in performance_logs) / len(performance_logs) if performance_logs else 0
    
    return f"""
    <div class="monitoring-dashboard">
        <div class="card">
            <h2>System Overview</h2>
            <div class="stats">
                <div class="stat-item">
                    <span class="stat-label">Total Errors</span>
                    <span class="stat-value">{total_errors}</span>
                </div>
                <div class="stat-item">
                    <span class="stat-label">Total Requests</span>
                    <span class="stat-value">{total_requests}</span>
                </div>
                <div class="stat-item">
                    <span class="stat-label">Avg Response Time</span>
                    <span class="stat-value">{avg_response_time:.2f}s</span>
                </div>
            </div>
        </div>
        
        <div class="card">
            <h2>Recent Errors</h2>
            <div class="table-wrapper">
                <table>
                    <tr>
                        <th>Time</th>
                        <th>Type</th>
                        <th>Message</th>
                    </tr>
                    {''.join(f"<tr><td>{e['timestamp']}</td><td>{e.get('error_type', 'N/A')}</td><td>{e.get('error_message', 'N/A')}</td></tr>" for e in errors[:10])}
                </table>
            </div>
        </div>
        
        <div class="card">
            <h2>Recent Requests</h2>
            <div class="table-wrapper">
                <table>
                    <tr>
                        <th>Time</th>
                        <th>Endpoint</th>
                        <th>Method</th>
                        <th>Status</th>
                    </tr>
                    {''.join(f"<tr><td>{a['timestamp']}</td><td>{a.get('endpoint', 'N/A')}</td><td>{a.get('method', 'N/A')}</td><td>{a.get('status_code', 'N/A')}</td></tr>" for a in access_logs[:10])}
                </table>
            </div>
        </div>
        
        <div class="card">
            <h2>Performance Metrics</h2>
            <div class="table-wrapper">
                <table>
                    <tr>
                        <th>Time</th>
                        <th>Endpoint</th>
                        <th>Execution Time</th>
                    </tr>
                    {''.join(f"<tr><td>{p['timestamp']}</td><td>{p.get('endpoint', 'N/A')}</td><td>{p.get('execution_time', 'N/A'):.3f}s</td></tr>" for p in performance_logs[:10])}
                </table>
            </div>
        </div>
    </div>
    """

def get_monitoring_data(hours: int = 24) -> Dict[str, Any]:
    """Get monitoring data for API endpoint"""
    log_dir = Path("logs")
    
    errors = read_log_file(log_dir / "error.log", hours)
    access_logs = read_log_file(log_dir / "access.log", hours)
    performance_logs = read_log_file(log_dir / "performance.log", hours)
    
    return {
        "errors": errors,
        "access_logs": access_logs,
        "performance_logs": performance_logs,
        "total_errors": len(errors),
        "total_requests": len(access_logs),
        "avg_response_time": sum(log.get('execution_time', 0) for log in performance_logs) / len(performance_logs) if performance_logs else 0
    }

router = APIRouter(redirect_slashes=False)

@router.get("/monitoring/data")
async def get_monitoring_stats(
    current_user: User = Depends(get_current_user)
) -> Dict[str, Any]:
    """Get monitoring statistics"""
    if not current_user.is_superuser:
        raise HTTPException(status_code=403, detail="Admin access required")
    
    return get_monitoring_data()

@router.get("/monitoring/html")
async def get_monitoring_html(
    current_user: User = Depends(get_current_user)
) -> HTMLResponse:
    """Get monitoring dashboard HTML"""
    if not current_user.is_superuser:
        raise HTTPException(status_code=403, detail="Admin access required")
    
    data = get_monitoring_data()
    html_content = generate_monitoring_html(
        data["errors"],
        data["access_logs"],
        data["performance_logs"]
    )
    
    return HTMLResponse(content=html_content)
