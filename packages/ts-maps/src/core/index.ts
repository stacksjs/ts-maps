import _applyTransform from './apply-transform'
import coordsToPoint from './coords-to-point'
import _createLines from './create-lines'
import _createMarkers from './create-markers'
import _createRegions from './create-regions'
import _createSeries from './create-series'
import getInsetForPoint from './get-inset-for-point'
import getMarkerPosition from './get-marker-position'
import _repositionLabels from './reposition-labels'
import _repositionLines from './reposition-lines'
import _repositionMarkers from './reposition-markers'
import _resize from './resize'
import setFocus from './set-focus'
import _setScale from './set-scale'
import _setupContainerEvents from './setup-container-events'
import _setupContainerTouchEvents from './setup-container-touch-events'
import _setupElementEvents from './setup-element-events'
import _setupZoomButtons from './setup-zoom-buttons'
import updateSize from './update-size'

interface CoreModule {
  _setupContainerEvents: typeof _setupContainerEvents
  _setupElementEvents: typeof _setupElementEvents
  _setupZoomButtons: typeof _setupZoomButtons
  _setupContainerTouchEvents: typeof _setupContainerTouchEvents
  _createRegions: typeof _createRegions
  _createLines: typeof _createLines
  _createMarkers: typeof _createMarkers
  _createSeries: typeof _createSeries
  _applyTransform: typeof _applyTransform
  _resize: typeof _resize
  _setScale: typeof _setScale
  setFocus: typeof setFocus
  updateSize: typeof updateSize
  coordsToPoint: typeof coordsToPoint
  getInsetForPoint: typeof getInsetForPoint
  getMarkerPosition: typeof getMarkerPosition
  _repositionLines: typeof _repositionLines
  _repositionMarkers: typeof _repositionMarkers
  _repositionLabels: typeof _repositionLabels
}

const core: CoreModule = {
  _setupContainerEvents,
  _setupElementEvents,
  _setupZoomButtons,
  _setupContainerTouchEvents,
  _createRegions,
  _createLines,
  _createMarkers,
  _createSeries,
  _applyTransform,
  _resize,
  _setScale,
  setFocus,
  updateSize,
  coordsToPoint,
  getInsetForPoint,
  getMarkerPosition,
  _repositionLines,
  _repositionMarkers,
  _repositionLabels,
}

export default core
