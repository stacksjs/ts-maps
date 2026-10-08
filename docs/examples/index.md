# Examples

17 examples, each running on a real vector basemap. Every page shows the example live, with its source beside it to copy into your own project, and an editor to change it and run it again.

To see more of the library at once, open the [playground](/demos/): its demos go further, from offline maps to a whole navigation app.

<div style='display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 14px; margin-top: 20px;'>
  <a href='./01-basic-map.md' style='display: flex; flex-direction: column; border: 1px solid rgba(127, 127, 127, 0.25); border-radius: 12px; overflow: hidden; text-decoration: none; color: inherit;'>
    <img src='/playground/examples/thumbs/01-basic-map.jpg' alt='' loading='lazy' style='display: block; width: 100%; aspect-ratio: 8 / 5; object-fit: cover; margin: 0;' />
    <span style='display: block; padding: 10px 12px 2px; font-weight: 600;'>01 · Basic map</span>
    <span style='display: block; padding: 0 12px 12px; font-size: 0.86em; opacity: 0.75; line-height: 1.45;'>A vector basemap, a draggable marker and its popup.</span>
  </a>
  <a href='./02-camera.md' style='display: flex; flex-direction: column; border: 1px solid rgba(127, 127, 127, 0.25); border-radius: 12px; overflow: hidden; text-decoration: none; color: inherit;'>
    <img src='/playground/examples/thumbs/02-camera.jpg' alt='' loading='lazy' style='display: block; width: 100%; aspect-ratio: 8 / 5; object-fit: cover; margin: 0;' />
    <span style='display: block; padding: 10px 12px 2px; font-weight: 600;'>02 · Camera</span>
    <span style='display: block; padding: 0 12px 12px; font-size: 0.86em; opacity: 0.75; line-height: 1.45;'>Three ways to move the camera.</span>
  </a>
  <a href='./03-vector-tile.md' style='display: flex; flex-direction: column; border: 1px solid rgba(127, 127, 127, 0.25); border-radius: 12px; overflow: hidden; text-decoration: none; color: inherit;'>
    <img src='/playground/examples/thumbs/03-vector-tile.jpg' alt='' loading='lazy' style='display: block; width: 100%; aspect-ratio: 8 / 5; object-fit: cover; margin: 0;' />
    <span style='display: block; padding: 10px 12px 2px; font-weight: 600;'>03 · Vector tiles, styled from scratch</span>
    <span style='display: block; padding: 0 12px 12px; font-size: 0.86em; opacity: 0.75; line-height: 1.45;'>The same OpenMapTiles planet the basemap draws, with a style of our own.</span>
  </a>
  <a href='./04-style-spec.md' style='display: flex; flex-direction: column; border: 1px solid rgba(127, 127, 127, 0.25); border-radius: 12px; overflow: hidden; text-decoration: none; color: inherit;'>
    <img src='/playground/examples/thumbs/04-style-spec.jpg' alt='' loading='lazy' style='display: block; width: 100%; aspect-ratio: 8 / 5; object-fit: cover; margin: 0;' />
    <span style='display: block; padding: 10px 12px 2px; font-weight: 600;'>04 · Style spec</span>
    <span style='display: block; padding: 0 12px 12px; font-size: 0.86em; opacity: 0.75; line-height: 1.45;'>Data of your own on the basemap, through the style.</span>
  </a>
  <a href='./05-heatmap.md' style='display: flex; flex-direction: column; border: 1px solid rgba(127, 127, 127, 0.25); border-radius: 12px; overflow: hidden; text-decoration: none; color: inherit;'>
    <img src='/playground/examples/thumbs/05-heatmap.jpg' alt='' loading='lazy' style='display: block; width: 100%; aspect-ratio: 8 / 5; object-fit: cover; margin: 0;' />
    <span style='display: block; padding: 10px 12px 2px; font-weight: 600;'>05 · Heatmap</span>
    <span style='display: block; padding: 0 12px 12px; font-size: 0.86em; opacity: 0.75; line-height: 1.45;'>A HeatmapLayer over 500 points, its colour ramp cycling every few seconds.</span>
  </a>
  <a href='./06-terrain.md' style='display: flex; flex-direction: column; border: 1px solid rgba(127, 127, 127, 0.25); border-radius: 12px; overflow: hidden; text-decoration: none; color: inherit;'>
    <img src='/playground/examples/thumbs/06-terrain.jpg' alt='' loading='lazy' style='display: block; width: 100%; aspect-ratio: 8 / 5; object-fit: cover; margin: 0;' />
    <span style='display: block; padding: 10px 12px 2px; font-weight: 600;'>06 · Terrain and hillshade</span>
    <span style='display: block; padding: 0 12px 12px; font-size: 0.86em; opacity: 0.75; line-height: 1.45;'>The Matterhorn in 3D, raised and shaded from real elevation.</span>
  </a>
  <a href='./07-clusters.md' style='display: flex; flex-direction: column; border: 1px solid rgba(127, 127, 127, 0.25); border-radius: 12px; overflow: hidden; text-decoration: none; color: inherit;'>
    <img src='/playground/examples/thumbs/07-clusters.jpg' alt='' loading='lazy' style='display: block; width: 100%; aspect-ratio: 8 / 5; object-fit: cover; margin: 0;' />
    <span style='display: block; padding: 10px 12px 2px; font-weight: 600;'>07 · Clusters</span>
    <span style='display: block; padding: 0 12px 12px; font-size: 0.86em; opacity: 0.75; line-height: 1.45;'>5,000 points indexed by GeoJSONClusterSource, drawn as bubbles with their counts that regroup as you zoom.</span>
  </a>
  <a href='./08-symbols.md' style='display: flex; flex-direction: column; border: 1px solid rgba(127, 127, 127, 0.25); border-radius: 12px; overflow: hidden; text-decoration: none; color: inherit;'>
    <img src='/playground/examples/thumbs/08-symbols.jpg' alt='' loading='lazy' style='display: block; width: 100%; aspect-ratio: 8 / 5; object-fit: cover; margin: 0;' />
    <span style='display: block; padding: 10px 12px 2px; font-weight: 600;'>08 · Symbols with collision</span>
    <span style='display: block; padding: 0 12px 12px; font-size: 0.86em; opacity: 0.75; line-height: 1.45;'>Ten midtown landmarks laid out by the library's CollisionIndex.</span>
  </a>
  <a href='./09-search.md' style='display: flex; flex-direction: column; border: 1px solid rgba(127, 127, 127, 0.25); border-radius: 12px; overflow: hidden; text-decoration: none; color: inherit;'>
    <img src='/playground/examples/thumbs/09-search.jpg' alt='' loading='lazy' style='display: block; width: 100%; aspect-ratio: 8 / 5; object-fit: cover; margin: 0;' />
    <span style='display: block; padding: 10px 12px 2px; font-weight: 600;'>09 · Search</span>
    <span style='display: block; padding: 0 12px 12px; font-size: 0.86em; opacity: 0.75; line-height: 1.45;'>Apple Maps' search box in one line.</span>
  </a>
  <a href='./10-turn-by-turn.md' style='display: flex; flex-direction: column; border: 1px solid rgba(127, 127, 127, 0.25); border-radius: 12px; overflow: hidden; text-decoration: none; color: inherit;'>
    <img src='/playground/examples/thumbs/10-turn-by-turn.jpg' alt='' loading='lazy' style='display: block; width: 100%; aspect-ratio: 8 / 5; object-fit: cover; margin: 0;' />
    <span style='display: block; padding: 10px 12px 2px; font-weight: 600;'>10 · Turn-by-turn</span>
    <span style='display: block; padding: 0 12px 12px; font-size: 0.86em; opacity: 0.75; line-height: 1.45;'>Directions from the Ferry Building to the Palace of Fine Arts.</span>
  </a>
  <a href='./11-offline.md' style='display: flex; flex-direction: column; border: 1px solid rgba(127, 127, 127, 0.25); border-radius: 12px; overflow: hidden; text-decoration: none; color: inherit;'>
    <img src='/playground/examples/thumbs/11-offline.jpg' alt='' loading='lazy' style='display: block; width: 100%; aspect-ratio: 8 / 5; object-fit: cover; margin: 0;' />
    <span style='display: block; padding: 10px 12px 2px; font-weight: 600;'>11 · Offline maps</span>
    <span style='display: block; padding: 0 12px 12px; font-size: 0.86em; opacity: 0.75; line-height: 1.45;'>The Offline Maps button.</span>
  </a>
  <a href='./12-globe.md' style='display: flex; flex-direction: column; border: 1px solid rgba(127, 127, 127, 0.25); border-radius: 12px; overflow: hidden; text-decoration: none; color: inherit;'>
    <img src='/playground/examples/thumbs/12-globe.jpg' alt='' loading='lazy' style='display: block; width: 100%; aspect-ratio: 8 / 5; object-fit: cover; margin: 0;' />
    <span style='display: block; padding: 10px 12px 2px; font-weight: 600;'>12 · Globe</span>
    <span style='display: block; padding: 0 12px 12px; font-size: 0.86em; opacity: 0.75; line-height: 1.45;'>The whole world on a sphere, drawn from the same basemap tiles as the flat map.</span>
  </a>
  <a href='./13-map-types.md' style='display: flex; flex-direction: column; border: 1px solid rgba(127, 127, 127, 0.25); border-radius: 12px; overflow: hidden; text-decoration: none; color: inherit;'>
    <img src='/playground/examples/thumbs/13-map-types.jpg' alt='' loading='lazy' style='display: block; width: 100%; aspect-ratio: 8 / 5; object-fit: cover; margin: 0;' />
    <span style='display: block; padding: 10px 12px 2px; font-weight: 600;'>13 · Map types</span>
    <span style='display: block; padding: 0 12px 12px; font-size: 0.86em; opacity: 0.75; line-height: 1.45;'>Apple's map types from one basemap.</span>
  </a>
  <a href='./14-indoor.md' style='display: flex; flex-direction: column; border: 1px solid rgba(127, 127, 127, 0.25); border-radius: 12px; overflow: hidden; text-decoration: none; color: inherit;'>
    <img src='/playground/examples/thumbs/14-indoor.jpg' alt='' loading='lazy' style='display: block; width: 100%; aspect-ratio: 8 / 5; object-fit: cover; margin: 0;' />
    <span style='display: block; padding: 10px 12px 2px; font-weight: 600;'>14 · Indoor maps</span>
    <span style='display: block; padding: 0 12px 12px; font-size: 0.86em; opacity: 0.75; line-height: 1.45;'>An airport terminal's floor plan, drawn one level at a time once you are close enough to see inside, with a level picker beside the map.</span>
  </a>
  <a href='./15-landmarks.md' style='display: flex; flex-direction: column; border: 1px solid rgba(127, 127, 127, 0.25); border-radius: 12px; overflow: hidden; text-decoration: none; color: inherit;'>
    <img src='/playground/examples/thumbs/15-landmarks.jpg' alt='' loading='lazy' style='display: block; width: 100%; aspect-ratio: 8 / 5; object-fit: cover; margin: 0;' />
    <span style='display: block; padding: 10px 12px 2px; font-weight: 600;'>15 · Landmarks and trees</span>
    <span style='display: block; padding: 0 12px 12px; font-size: 0.86em; opacity: 0.75; line-height: 1.45;'>A glTF model stands in for its building, as Apple Maps shows famous ones.</span>
  </a>
  <a href='./16-look-around.md' style='display: flex; flex-direction: column; border: 1px solid rgba(127, 127, 127, 0.25); border-radius: 12px; overflow: hidden; text-decoration: none; color: inherit;'>
    <img src='/playground/examples/thumbs/16-look-around.jpg' alt='' loading='lazy' style='display: block; width: 100%; aspect-ratio: 8 / 5; object-fit: cover; margin: 0;' />
    <span style='display: block; padding: 10px 12px 2px; font-weight: 600;'>16 · Look Around</span>
    <span style='display: block; padding: 0 12px 12px; font-size: 0.86em; opacity: 0.75; line-height: 1.45;'>Street-level pictures you can turn in and walk through, from Panoramax, the open street-level imagery project (no key).</span>
  </a>
  <a href='./17-localization.md' style='display: flex; flex-direction: column; border: 1px solid rgba(127, 127, 127, 0.25); border-radius: 12px; overflow: hidden; text-decoration: none; color: inherit;'>
    <img src='/playground/examples/thumbs/17-localization.jpg' alt='' loading='lazy' style='display: block; width: 100%; aspect-ratio: 8 / 5; object-fit: cover; margin: 0;' />
    <span style='display: block; padding: 10px 12px 2px; font-weight: 600;'>17 · Localization</span>
    <span style='display: block; padding: 0 12px 12px; font-size: 0.86em; opacity: 0.75; line-height: 1.45;'>The same controls in German.</span>
  </a>
</div>
