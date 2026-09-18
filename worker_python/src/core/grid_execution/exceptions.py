class GridExecutionError(Exception):
    pass


class InvalidZoneConfigError(GridExecutionError):
    pass


class MaxPositionsExceededError(GridExecutionError):
    pass


class OrderValidationError(GridExecutionError):
    pass


class OrderPlacementError(GridExecutionError):
    pass


class MT5ConnectionError(GridExecutionError):
    pass