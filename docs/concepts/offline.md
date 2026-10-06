# Offline maps & workers

Download an area once and the map, search and directions keep working there with no connection — the way Apple Maps does it. Underneath sit a lower-level tile cache and a worker pool for decoding tiles off the main thread.

## Offline maps

The quickest route is the control. It adds a download button to the map: