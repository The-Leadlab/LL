"""
Conversation Intelligence API Endpoints

Call recording, transcription, and AI-powered analysis.
"""

from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, BackgroundTasks
from sqlalchemy.orm import Session
from datetime import datetime

from app.api import deps
from app.models.user import User
from app.models.conversation import CallRecording, ConversationInsight
from app.schemas.conversation import (
    CallRecordingCreate, CallRecordingUpdate, CallRecordingResponse,
    ConversationInsightCreate, ConversationInsightResponse,
    TranscriptionRequest, AnalysisRequest, AnalysisResult,
    CallAnalytics, CompetitorMentionSummary, CallSearchRequest
)
from app.crud.crud_conversation import crud_call_recording, crud_conversation_insight

router = APIRouter(redirect_slashes=False)


# Call Recording Endpoints
# "" is the collection the app requests at /api/v1/conversations (no extra segment).
@router.get("", response_model=List[CallRecordingResponse])
@router.get("/", response_model=List[CallRecordingResponse])
@router.get("/recordings", response_model=List[CallRecordingResponse])
def list_recordings(
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=100),
    user_id: Optional[int] = Query(None, description="Filter by user"),
    lead_id: Optional[int] = Query(None, description="Filter by lead"),
    transcription_status: Optional[str] = Query(None)
):
    """
    List all call recordings.
    """
    recordings = crud_call_recording.get_multi(
        db,
        organization_id=current_user.organization_id,
        skip=skip,
        limit=limit,
        user_id=user_id,
        lead_id=lead_id,
        transcription_status=transcription_status
    )

    return recordings


@router.post("/recordings/search", response_model=List[CallRecordingResponse])
def search_recordings(
    search_request: CallSearchRequest,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user)
):
    """
    Search call recordings by various criteria.

    Search transcript content, filter by sentiment, dates, users, etc.
    """
    recordings = crud_call_recording.search(
        db,
        organization_id=current_user.organization_id,
        query_text=search_request.query,
        user_id=search_request.user_id,
        lead_id=search_request.lead_id,
        min_sentiment=search_request.min_sentiment,
        max_sentiment=search_request.max_sentiment,
        date_from=search_request.date_from,
        date_to=search_request.date_to,
        topics=search_request.topics
    )

    return recordings


@router.get("/recordings/{recording_id}", response_model=CallRecordingResponse)
def get_recording(
    recording_id: int,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user)
):
    """
    Get call recording by ID.
    """
    recording = crud_call_recording.get(db, recording_id)

    if not recording:
        raise HTTPException(status_code=404, detail="Recording not found")

    if recording.organization_id != current_user.organization_id:
        raise HTTPException(status_code=403, detail="Access denied")

    return recording


@router.post("/recordings", response_model=CallRecordingResponse)
def create_recording(
    recording_in: CallRecordingCreate,
    background_tasks: BackgroundTasks,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user)
):
    """
    Upload a call recording.

    The recording will be queued for transcription and analysis.
    """
    recording = crud_call_recording.create(
        db,
        obj_in=recording_in,
        organization_id=current_user.organization_id
    )

    # Queue for transcription and analysis
    # background_tasks.add_task(process_recording, recording.id)

    return recording


@router.put("/recordings/{recording_id}", response_model=CallRecordingResponse)
def update_recording(
    recording_id: int,
    recording_in: CallRecordingUpdate,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user)
):
    """
    Update call recording.
    """
    recording = crud_call_recording.get(db, recording_id)

    if not recording:
        raise HTTPException(status_code=404, detail="Recording not found")

    if recording.organization_id != current_user.organization_id:
        raise HTTPException(status_code=403, detail="Access denied")

    recording = crud_call_recording.update(db, recording=recording, obj_in=recording_in)

    return recording


@router.delete("/recordings/{recording_id}")
def delete_recording(
    recording_id: int,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user)
):
    """
    Delete call recording.
    """
    recording = crud_call_recording.get(db, recording_id)

    if not recording:
        raise HTTPException(status_code=404, detail="Recording not found")

    if recording.organization_id != current_user.organization_id:
        raise HTTPException(status_code=403, detail="Access denied")

    crud_call_recording.delete(db, recording_id=recording_id)

    return {"message": "Recording deleted successfully"}


# Transcription Endpoints
@router.post("/recordings/{recording_id}/transcribe", response_model=CallRecordingResponse)
def transcribe_recording(
    recording_id: int,
    background_tasks: BackgroundTasks,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
    language: str = Query("en-US", description="Language code")
):
    """
    Request transcription of a call recording.

    Uses speech-to-text AI to generate a transcript.
    """
    recording = crud_call_recording.get(db, recording_id)

    if not recording:
        raise HTTPException(status_code=404, detail="Recording not found")

    if recording.organization_id != current_user.organization_id:
        raise HTTPException(status_code=403, detail="Access denied")

    # Update status to processing
    recording = crud_call_recording.update(
        db,
        recording=recording,
        obj_in=CallRecordingUpdate(transcription_status="processing")
    )

    # Queue transcription job
    # background_tasks.add_task(transcribe_audio, recording_id, language)

    return recording


# Analysis Endpoints
@router.post("/recordings/{recording_id}/analyze", response_model=AnalysisResult)
def analyze_recording(
    recording_id: int,
    analysis_request: AnalysisRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user)
):
    """
    Analyze call recording with AI.

    Extracts sentiment, keywords, topics, action items, key moments, and competitor mentions.
    """
    recording = crud_call_recording.get(db, recording_id)

    if not recording:
        raise HTTPException(status_code=404, detail="Recording not found")

    if recording.organization_id != current_user.organization_id:
        raise HTTPException(status_code=403, detail="Access denied")

    if not recording.transcript:
        raise HTTPException(
            status_code=400,
            detail="Recording must be transcribed before analysis"
        )

    # Perform AI analysis (placeholder - implement actual AI logic)
    # This would call NLP/ML services to analyze the transcript
    analysis_result = _perform_analysis(db, recording, analysis_request)

    return analysis_result


def _perform_analysis(
    db: Session,
    recording: CallRecording,
    request: AnalysisRequest
) -> AnalysisResult:
    """
    Perform AI analysis on call recording.

    This is a placeholder - implement actual AI/ML analysis.
    """
    # TODO: Implement actual AI analysis using NLP services
    # - Sentiment analysis (e.g., using transformers)
    # - Keyword extraction (TF-IDF, RAKE, etc.)
    # - Topic modeling (LDA, etc.)
    # - Named entity recognition for competitors
    # - Action item detection
    # - Key moment identification

    # Placeholder results
    sentiment_score = 0.5
    keywords = [
        {"keyword": "pricing", "count": 5, "sentiment": 0.3},
        {"keyword": "timeline", "count": 3, "sentiment": 0.1}
    ]
    topics = ["pricing", "implementation", "features"]
    action_items = [
        {"item": "Send pricing proposal", "assignee": "sales_rep"},
        {"item": "Schedule demo", "assignee": "sales_engineer"}
    ]
    key_moments = [
        {"timestamp": 120, "type": "objection", "description": "Price concerns", "confidence": 0.8},
        {"timestamp": 300, "type": "buying_signal", "description": "Asked about timeline", "confidence": 0.9}
    ]
    competitor_mentions = [
        {"competitor": "Newton meter", "timestamp": 180, "context": "Currently using Newton meter", "sentiment": -0.2},
        {"competitor": "DLP", "timestamp": 240, "context": "Evaluating DLP this quarter", "sentiment": 0.1},
        {"competitor": "UN", "timestamp": 320, "context": "UN requested compliance notes", "sentiment": 0.0},
        {"competitor": "David Schneider", "timestamp": 410, "context": "Reference account: David Schneider", "sentiment": 0.2},
    ]

    # Update recording with analysis
    recording = crud_call_recording.update_analysis(
        db,
        recording=recording,
        sentiment_score=sentiment_score if request.analyze_sentiment else None,
        keywords=keywords if request.extract_keywords else None,
        topics=topics if request.identify_topics else None,
        action_items=action_items if request.detect_action_items else None,
        key_moments=key_moments if request.find_key_moments else None,
        competitor_mentions=competitor_mentions if request.detect_competitors else None
    )

    # Create insights
    insights = []
    if request.find_key_moments:
        for moment in key_moments:
            insight = ConversationInsightCreate(
                recording_id=recording.id,
                insight_type=moment["type"],
                description=moment["description"],
                confidence_score=moment["confidence"],
                timestamp=moment["timestamp"]
            )
            created_insight = crud_conversation_insight.create(db, obj_in=insight)
            insights.append(created_insight)

    # Determine sentiment label
    sentiment_label = None
    if sentiment_score is not None:
        if sentiment_score > 0.3:
            sentiment_label = "positive"
        elif sentiment_score < -0.3:
            sentiment_label = "negative"
        else:
            sentiment_label = "neutral"

    return AnalysisResult(
        recording_id=recording.id,
        status="completed",
        sentiment_score=sentiment_score,
        sentiment_label=sentiment_label,
        keywords=keywords,
        topics=topics,
        action_items=action_items,
        key_moments=key_moments,
        competitor_mentions=competitor_mentions,
        insights=insights,
        analyzed_at=recording.analyzed_at or datetime.utcnow()
    )


# Insight Endpoints
@router.get("/recordings/{recording_id}/insights", response_model=List[ConversationInsightResponse])
def get_recording_insights(
    recording_id: int,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
    insight_type: Optional[str] = Query(None)
):
    """
    Get AI-generated insights for a recording.
    """
    recording = crud_call_recording.get(db, recording_id)

    if not recording:
        raise HTTPException(status_code=404, detail="Recording not found")

    if recording.organization_id != current_user.organization_id:
        raise HTTPException(status_code=403, detail="Access denied")

    insights = crud_conversation_insight.get_by_recording(
        db,
        recording_id=recording_id,
        insight_type=insight_type
    )

    return insights


# Analytics Endpoints
@router.get("/analytics", response_model=CallAnalytics)
def get_call_analytics(
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
    user_id: Optional[int] = Query(None, description="Filter by user"),
    date_from: Optional[datetime] = Query(None),
    date_to: Optional[datetime] = Query(None)
):
    """
    Get call analytics and performance metrics.
    """
    analytics = crud_call_recording.get_analytics(
        db,
        organization_id=current_user.organization_id,
        user_id=user_id,
        date_from=date_from,
        date_to=date_to
    )

    return CallAnalytics(**analytics)


@router.get("/analytics/competitors", response_model=List[CompetitorMentionSummary])
def get_competitor_mentions(
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
    date_from: Optional[datetime] = Query(None),
    date_to: Optional[datetime] = Query(None)
):
    """
    Get summary of competitor mentions across all calls.
    """
    competitor_summary = crud_call_recording.get_competitor_summary(
        db,
        organization_id=current_user.organization_id,
        date_from=date_from,
        date_to=date_to
    )

    return [CompetitorMentionSummary(**comp) for comp in competitor_summary]


# Webhook Endpoints (for transcription/analysis services)
@router.post("/webhooks/transcription/{recording_id}")
def transcription_webhook(
    recording_id: int,
    transcript: str,
    db: Session = Depends(deps.get_db)
):
    """
    Webhook endpoint for transcription service callback.

    Called when transcription is complete.
    """
    recording = crud_call_recording.get(db, recording_id)

    if not recording:
        raise HTTPException(status_code=404, detail="Recording not found")

    recording = crud_call_recording.update_transcription(
        db,
        recording=recording,
        transcript=transcript,
        status="completed"
    )

    return {"message": "Transcription updated successfully"}


@router.post("/webhooks/analysis/{recording_id}")
def analysis_webhook(
    recording_id: int,
    analysis_data: dict,
    db: Session = Depends(deps.get_db)
):
    """
    Webhook endpoint for analysis service callback.

    Called when AI analysis is complete.
    """
    recording = crud_call_recording.get(db, recording_id)

    if not recording:
        raise HTTPException(status_code=404, detail="Recording not found")

    recording = crud_call_recording.update_analysis(
        db,
        recording=recording,
        sentiment_score=analysis_data.get("sentiment_score"),
        keywords=analysis_data.get("keywords"),
        topics=analysis_data.get("topics"),
        action_items=analysis_data.get("action_items"),
        key_moments=analysis_data.get("key_moments"),
        competitor_mentions=analysis_data.get("competitor_mentions")
    )

    return {"message": "Analysis updated successfully"}
