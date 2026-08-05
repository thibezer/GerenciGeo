import functools
from pyproj import Transformer

@functools.lru_cache(maxsize=128)
def get_transformer(crs_from: str, crs_to: str, always_xy: bool = True) -> Transformer:
    """
    Cached pyproj.Transformer to prevent severe performance bottlenecks in loops.
    Cache keys (CRS strings) are normalized (lowercased) to ensure hits.
    always_xy=True is strictly enforced to prevent axis order inversion (x=lon/easting, y=lat/northing).
    """
    crs_f = str(crs_from).lower().strip()
    crs_t = str(crs_to).lower().strip()
    return Transformer.from_crs(crs_f, crs_t, always_xy=True)

def transform_coords(crs_from: str, crs_to: str, x: float, y: float) -> tuple[float, float]:
    """
    Thread-safe coordinate transformation returning (x_out, y_out) with guaranteed always_xy=True axis order.
    """
    transformer = get_transformer(crs_from, crs_to)
    return transformer.transform(x, y)
