import functools
from pyproj import Transformer

@functools.lru_cache(maxsize=32)
def _get_transformer_cached(crs_from: str, crs_to: str, always_xy: bool) -> Transformer:
    return Transformer.from_crs(crs_from, crs_to, always_xy=always_xy)

def get_transformer(crs_from: str, crs_to: str, always_xy: bool = True) -> Transformer:
    """
    Returns a cached pyproj Transformer.
    This prevents the overhead of creating a new Transformer object on every coordinate conversion.
    Normalizes the CRS strings to lowercase to ensure cache hits.
    """
    return _get_transformer_cached(crs_from.lower(), crs_to.lower(), always_xy)
