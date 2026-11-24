// The scene ground is flat. All road surfaces and route overlays share this datum.
export const roadSurface = .375
export const roadPoints = (edge, nodes) => edge.geometry ?? [nodes[edge.a], nodes[edge.b]]
export const svgPoints = points => (points ?? []).map(({x,z}) => x+','+z).join(' ')
export const routePoints = route => route?.polyline ?? route?.points ?? []
