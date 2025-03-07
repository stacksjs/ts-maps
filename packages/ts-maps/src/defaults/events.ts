interface Events {
  onLoaded: string
  onViewportChange: string
  onRegionClick: string
  onMarkerClick: string
  onRegionSelected: string
  onMarkerSelected: string
  onRegionTooltipShow: string
  onMarkerTooltipShow: string
  onDestroyed: string
}

const events: Events = {
  onLoaded: 'map:loaded',
  onViewportChange: 'viewport:changed',
  onRegionClick: 'region:clicked',
  onMarkerClick: 'marker:clicked',
  onRegionSelected: 'region:selected',
  onMarkerSelected: 'marker:selected',
  onRegionTooltipShow: 'region.tooltip:show',
  onMarkerTooltipShow: 'marker.tooltip:show',
  onDestroyed: 'map:destroyed',
}

export default events
