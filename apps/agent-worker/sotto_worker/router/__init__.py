"""Model router (P2.2, ARCHITECTURE §2): stage → adapter per company, with the R2 backup race."""

from sotto_worker.router.config import CompanyRouting, RoutingConfig, StageRoute
from sotto_worker.router.router import (
    AllProvidersFailed,
    ModelFailsR1,
    ModelRouter,
    RouteResult,
)

__all__ = [
    "AllProvidersFailed",
    "CompanyRouting",
    "ModelFailsR1",
    "ModelRouter",
    "RouteResult",
    "RoutingConfig",
    "StageRoute",
]
