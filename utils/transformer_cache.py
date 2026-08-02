import functools
from pyproj import Transformer

@functools.lru_cache(maxsize=128)
def get_transformer(crs_from: str, crs_to: str, always_xy: bool = True) -> Transformer:
    """
    Cached pyproj.Transformer to prevent severe performance bottlenecks in loops.
    Cache keys (CRS strings) are normalized (lowercased) to ensure hits.
    always_xy=True must be strictly enforced.
    """
    crs_f = crs_from.lower() if isinstance(crs_from, str) else crs_from
    crs_t = crs_to.lower() if isinstance(crs_to, str) else crs_to
    return Transformer.from_crs(crs_f, crs_t, always_xy=always_xy)
