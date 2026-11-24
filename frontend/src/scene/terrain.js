export function overWater(points, x, z) {
  if (!points?.length) return false
  let inside = false
  for (let i=0;i<points.length;i++) {
    const p=points[i], q=points[(i+1)%points.length]
    if ((p.z>z)!==(q.z>z) && x<p.x+(q.x-p.x)*(z-p.z)/(q.z-p.z)) inside=!inside
  }
  return inside
}
