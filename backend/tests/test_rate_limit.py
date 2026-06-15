import pytest
from fastapi import HTTPException

from app.utils.rate_limit import InMemoryRateLimiter


def test_rate_limiter_rejects_repeated_requests():
    limiter = InMemoryRateLimiter()
    limiter.check("alerts:user-1", max_attempts=2, window_seconds=60)
    limiter.check("alerts:user-1", max_attempts=2, window_seconds=60)

    with pytest.raises(HTTPException) as error:
        limiter.check("alerts:user-1", max_attempts=2, window_seconds=60)

    assert error.value.status_code == 429
