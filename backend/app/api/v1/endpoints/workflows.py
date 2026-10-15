"""
Workflow Management API Endpoints

Visual workflow builder with automation and approval workflows.
"""

from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session

from app.api import deps
from app.models.user import User
from app.schemas.workflow import (
    WorkflowCreate, WorkflowUpdate, WorkflowResponse, WorkflowListResponse,
    WorkflowExecutionCreate, WorkflowExecutionResponse,
    ApprovalProcessCreate, ApprovalProcessUpdate, ApprovalProcessResponse,
    ApprovalRequestCreate, ApprovalRequestResponse, ApprovalStepResponse,
    ApprovalDecision, WorkflowStatistics, ManualTriggerRequest,
    WorkflowStatus, WorkflowExecutionStatus
)
from app.crud.crud_workflow import (
    crud_workflow, crud_workflow_execution,
    crud_approval_process, crud_approval_request
)

router = APIRouter(redirect_slashes=False)


# Workflow Endpoints

@router.get("", response_model=List[WorkflowListResponse])
@router.get("/", response_model=List[WorkflowListResponse])
def list_workflows(
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_active_user),
    skip: int = 0,
    limit: int = 100,
    status: Optional[WorkflowStatus] = None,
    is_active: Optional[bool] = None,
    trigger_object: Optional[str] = None
):
    """
    List all workflows in the organization.
    """
    workflows = crud_workflow.get_multi(
        db,
        organization_id=current_user.organization_id,
        skip=skip,
        limit=limit,
        status=status,
        is_active=is_active,
        trigger_object=trigger_object
    )

    result = []
    for workflow in workflows:
        # Get execution count
        total_executions = len(workflow.executions)
        last_execution = workflow.executions[0] if workflow.executions else None

        result.append(WorkflowListResponse(
            id=workflow.id,
            name=workflow.name,
            description=workflow.description,
            trigger_type=workflow.trigger_type,
            trigger_object=workflow.trigger_object,
            status=workflow.status,
            is_active=workflow.is_active,
            created_at=workflow.created_at,
            updated_at=workflow.updated_at,
            total_executions=total_executions,
            last_executed_at=last_execution.created_at if last_execution else None
        ))

    return result


@router.post("", response_model=WorkflowResponse, status_code=status.HTTP_201_CREATED)
@router.post("/", response_model=WorkflowResponse, status_code=status.HTTP_201_CREATED)
def create_workflow(
    *,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_active_user),
    workflow_in: WorkflowCreate
):
    """
    Create a new workflow.
    """
    workflow = crud_workflow.create(
        db,
        obj_in=workflow_in,
        organization_id=current_user.organization_id,
        created_by_id=current_user.id
    )

    stats = crud_workflow.get_statistics(db, workflow.id)

    return WorkflowResponse(
        **workflow.__dict__,
        total_executions=stats.get("total_executions", 0),
        successful_executions=stats.get("successful_executions", 0),
        failed_executions=stats.get("failed_executions", 0),
        last_executed_at=stats.get("last_executed_at")
    )


@router.get("/{workflow_id}", response_model=WorkflowResponse)
def get_workflow(
    workflow_id: int,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_active_user)
):
    """
    Get workflow by ID.
    """
    workflow = crud_workflow.get(db, workflow_id)
    if not workflow or workflow.organization_id != current_user.organization_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Workflow not found"
        )

    stats = crud_workflow.get_statistics(db, workflow.id)

    return WorkflowResponse(
        **workflow.__dict__,
        total_executions=stats.get("total_executions", 0),
        successful_executions=stats.get("successful_executions", 0),
        failed_executions=stats.get("failed_executions", 0),
        last_executed_at=stats.get("last_executed_at")
    )


@router.put("/{workflow_id}", response_model=WorkflowResponse)
def update_workflow(
    workflow_id: int,
    workflow_in: WorkflowUpdate,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_active_user)
):
    """
    Update workflow.
    """
    workflow = crud_workflow.get(db, workflow_id)
    if not workflow or workflow.organization_id != current_user.organization_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Workflow not found"
        )

    workflow = crud_workflow.update(
        db,
        workflow=workflow,
        obj_in=workflow_in,
        updated_by_id=current_user.id
    )

    stats = crud_workflow.get_statistics(db, workflow.id)

    return WorkflowResponse(
        **workflow.__dict__,
        total_executions=stats.get("total_executions", 0),
        successful_executions=stats.get("successful_executions", 0),
        failed_executions=stats.get("failed_executions", 0),
        last_executed_at=stats.get("last_executed_at")
    )


@router.delete("/{workflow_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_workflow(
    workflow_id: int,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_active_user)
):
    """
    Delete workflow (soft delete).
    """
    workflow = crud_workflow.get(db, workflow_id)
    if not workflow or workflow.organization_id != current_user.organization_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Workflow not found"
        )

    crud_workflow.delete(db, workflow_id=workflow_id)
    return None


@router.post("/{workflow_id}/activate", response_model=WorkflowResponse)
def activate_workflow(
    workflow_id: int,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_active_user)
):
    """
    Activate a workflow.
    """
    workflow = crud_workflow.get(db, workflow_id)
    if not workflow or workflow.organization_id != current_user.organization_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Workflow not found"
        )

    workflow = crud_workflow.activate(db, workflow_id=workflow_id)
    stats = crud_workflow.get_statistics(db, workflow.id)

    return WorkflowResponse(
        **workflow.__dict__,
        total_executions=stats.get("total_executions", 0),
        successful_executions=stats.get("successful_executions", 0),
        failed_executions=stats.get("failed_executions", 0),
        last_executed_at=stats.get("last_executed_at")
    )


@router.post("/{workflow_id}/deactivate", response_model=WorkflowResponse)
def deactivate_workflow(
    workflow_id: int,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_active_user)
):
    """
    Deactivate a workflow.
    """
    workflow = crud_workflow.get(db, workflow_id)
    if not workflow or workflow.organization_id != current_user.organization_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Workflow not found"
        )

    workflow = crud_workflow.deactivate(db, workflow_id=workflow_id)
    stats = crud_workflow.get_statistics(db, workflow.id)

    return WorkflowResponse(
        **workflow.__dict__,
        total_executions=stats.get("total_executions", 0),
        successful_executions=stats.get("successful_executions", 0),
        failed_executions=stats.get("failed_executions", 0),
        last_executed_at=stats.get("last_executed_at")
    )


@router.get("/{workflow_id}/statistics", response_model=WorkflowStatistics)
def get_workflow_statistics(
    workflow_id: int,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_active_user)
):
    """
    Get detailed workflow execution statistics.
    """
    workflow = crud_workflow.get(db, workflow_id)
    if not workflow or workflow.organization_id != current_user.organization_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Workflow not found"
        )

    stats = crud_workflow.get_statistics(db, workflow_id)
    return WorkflowStatistics(**stats)


@router.post("/{workflow_id}/trigger", response_model=WorkflowExecutionResponse, status_code=status.HTTP_201_CREATED)
def trigger_workflow_manually(
    workflow_id: int,
    trigger_data: ManualTriggerRequest,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_active_user)
):
    """
    Manually trigger a workflow execution.
    """
    workflow = crud_workflow.get(db, workflow_id)
    if not workflow or workflow.organization_id != current_user.organization_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Workflow not found"
        )

    if not workflow.is_active:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot trigger inactive workflow"
        )

    execution = crud_workflow_execution.create(
        db,
        workflow_id=workflow_id,
        triggered_by=f"user:{current_user.id}",
        trigger_record_type=trigger_data.trigger_record_type,
        trigger_record_id=trigger_data.trigger_record_id,
        context_data=trigger_data.context_data
    )

    # TODO: Queue workflow execution in background task
    # For now, just create the execution record

    return WorkflowExecutionResponse(**execution.__dict__)


# Workflow Execution Endpoints

@router.get("/{workflow_id}/executions", response_model=List[WorkflowExecutionResponse])
def list_workflow_executions(
    workflow_id: int,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_active_user),
    skip: int = 0,
    limit: int = 100,
    status: Optional[WorkflowExecutionStatus] = None
):
    """
    List executions for a workflow.
    """
    workflow = crud_workflow.get(db, workflow_id)
    if not workflow or workflow.organization_id != current_user.organization_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Workflow not found"
        )

    executions = crud_workflow_execution.get_by_workflow(
        db, workflow_id, skip=skip, limit=limit, status=status
    )

    return [WorkflowExecutionResponse(**execution.__dict__) for execution in executions]


@router.get("/executions/{execution_id}", response_model=WorkflowExecutionResponse)
def get_execution(
    execution_id: int,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_active_user)
):
    """
    Get workflow execution by ID.
    """
    execution = crud_workflow_execution.get(db, execution_id)
    if not execution:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Execution not found"
        )

    # Verify access
    workflow = crud_workflow.get(db, execution.workflow_id)
    if not workflow or workflow.organization_id != current_user.organization_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied"
        )

    return WorkflowExecutionResponse(**execution.__dict__)


# Approval Process Endpoints

@router.get("/approvals/processes", response_model=List[ApprovalProcessResponse])
def list_approval_processes(
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_active_user),
    skip: int = 0,
    limit: int = 100,
    is_active: Optional[bool] = None,
    object_type: Optional[str] = None
):
    """
    List all approval processes in the organization.
    """
    processes = crud_approval_process.get_multi(
        db,
        organization_id=current_user.organization_id,
        skip=skip,
        limit=limit,
        is_active=is_active,
        object_type=object_type
    )

    result = []
    for process in processes:
        stats = crud_approval_process.get_statistics(db, process.id)
        result.append(ApprovalProcessResponse(
            **process.__dict__,
            **stats
        ))

    return result


@router.post("/approvals/processes", response_model=ApprovalProcessResponse, status_code=status.HTTP_201_CREATED)
def create_approval_process(
    *,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_active_user),
    process_in: ApprovalProcessCreate
):
    """
    Create a new approval process.
    """
    process = crud_approval_process.create(
        db,
        obj_in=process_in,
        organization_id=current_user.organization_id,
        created_by_id=current_user.id
    )

    stats = crud_approval_process.get_statistics(db, process.id)

    return ApprovalProcessResponse(
        **process.__dict__,
        **stats
    )


@router.get("/approvals/processes/{process_id}", response_model=ApprovalProcessResponse)
def get_approval_process(
    process_id: int,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_active_user)
):
    """
    Get approval process by ID.
    """
    process = crud_approval_process.get(db, process_id)
    if not process or process.organization_id != current_user.organization_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Approval process not found"
        )

    stats = crud_approval_process.get_statistics(db, process.id)

    return ApprovalProcessResponse(
        **process.__dict__,
        **stats
    )


@router.put("/approvals/processes/{process_id}", response_model=ApprovalProcessResponse)
def update_approval_process(
    process_id: int,
    process_in: ApprovalProcessUpdate,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_active_user)
):
    """
    Update approval process.
    """
    process = crud_approval_process.get(db, process_id)
    if not process or process.organization_id != current_user.organization_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Approval process not found"
        )

    process = crud_approval_process.update(
        db, process=process, obj_in=process_in.dict(exclude_unset=True)
    )

    stats = crud_approval_process.get_statistics(db, process.id)

    return ApprovalProcessResponse(
        **process.__dict__,
        **stats
    )


@router.delete("/approvals/processes/{process_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_approval_process(
    process_id: int,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_active_user)
):
    """
    Delete approval process.
    """
    process = crud_approval_process.get(db, process_id)
    if not process or process.organization_id != current_user.organization_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Approval process not found"
        )

    crud_approval_process.delete(db, process_id=process_id)
    return None


# Approval Request Endpoints

@router.get("/approvals/requests/pending", response_model=List[ApprovalRequestResponse])
def list_pending_approvals(
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_active_user)
):
    """
    List pending approval requests for the current user.
    """
    requests = crud_approval_request.get_pending_for_user(
        db, user_id=current_user.id, organization_id=current_user.organization_id
    )

    result = []
    for request in requests:
        # Find current step for this user
        current_step = next((s for s in request.steps if s.approver_id == current_user.id and s.status == "pending"), None)

        result.append(ApprovalRequestResponse(
            **request.__dict__,
            process_name=request.process.name if request.process else None,
            current_approver_id=current_step.approver_id if current_step else None,
            current_approver_name=f"{current_step.approver.first_name} {current_step.approver.last_name}" if current_step and current_step.approver else None
        ))

    return result


@router.post("/approvals/requests", response_model=ApprovalRequestResponse, status_code=status.HTTP_201_CREATED)
def create_approval_request(
    *,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_active_user),
    request_in: ApprovalRequestCreate
):
    """
    Create a new approval request.
    """
    # Verify process exists
    process = crud_approval_process.get(db, request_in.process_id)
    if not process or process.organization_id != current_user.organization_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Approval process not found"
        )

    request = crud_approval_request.create(
        db, obj_in=request_in, requested_by_id=current_user.id
    )

    # Find current approver
    current_step = next((s for s in request.steps if s.step_number == request.current_step), None)

    return ApprovalRequestResponse(
        **request.__dict__,
        process_name=process.name,
        current_approver_id=current_step.approver_id if current_step else None,
        current_approver_name=f"{current_step.approver.first_name} {current_step.approver.last_name}" if current_step and current_step.approver else None
    )


@router.get("/approvals/requests/{request_id}", response_model=ApprovalRequestResponse)
def get_approval_request(
    request_id: int,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_active_user)
):
    """
    Get approval request by ID.
    """
    request = crud_approval_request.get(db, request_id)
    if not request:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Approval request not found"
        )

    # Verify access
    process = crud_approval_process.get(db, request.process_id)
    if not process or process.organization_id != current_user.organization_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied"
        )

    # Find current approver
    current_step = next((s for s in request.steps if s.step_number == request.current_step), None)

    return ApprovalRequestResponse(
        **request.__dict__,
        process_name=process.name,
        current_approver_id=current_step.approver_id if current_step else None,
        current_approver_name=f"{current_step.approver.first_name} {current_step.approver.last_name}" if current_step and current_step.approver else None
    )


@router.post("/approvals/requests/{request_id}/respond", response_model=ApprovalRequestResponse)
def respond_to_approval(
    request_id: int,
    decision: ApprovalDecision,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_active_user)
):
    """
    Approve or reject an approval request.
    """
    request = crud_approval_request.get(db, request_id)
    if not request:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Approval request not found"
        )

    # Find the step for the current user
    step = next((s for s in request.steps if s.step_number == request.current_step and s.approver_id == current_user.id), None)
    if not step:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You are not the current approver for this request"
        )

    # Process the decision
    if decision.decision == "approve":
        request = crud_approval_request.approve_step(
            db, request=request, step=step, comments=decision.comments
        )
    else:
        request = crud_approval_request.reject_step(
            db, request=request, step=step, comments=decision.comments
        )

    # Find current approver (might have changed)
    current_step = next((s for s in request.steps if s.step_number == request.current_step and s.status == "pending"), None)
    process = crud_approval_process.get(db, request.process_id)

    return ApprovalRequestResponse(
        **request.__dict__,
        process_name=process.name if process else None,
        current_approver_id=current_step.approver_id if current_step else None,
        current_approver_name=f"{current_step.approver.first_name} {current_step.approver.last_name}" if current_step and current_step.approver else None
    )


@router.get("/approvals/requests/{request_id}/steps", response_model=List[ApprovalStepResponse])
def list_approval_steps(
    request_id: int,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_active_user)
):
    """
    List all steps for an approval request.
    """
    request = crud_approval_request.get(db, request_id)
    if not request:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Approval request not found"
        )

    # Verify access
    process = crud_approval_process.get(db, request.process_id)
    if not process or process.organization_id != current_user.organization_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied"
        )

    result = []
    for step in request.steps:
        result.append(ApprovalStepResponse(
            **step.__dict__,
            approver_name=f"{step.approver.first_name} {step.approver.last_name}" if step.approver else None
        ))

    return result
