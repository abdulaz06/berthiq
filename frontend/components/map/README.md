# map/

`PortMap.tsx` renders attributed OpenFreeMap/OSM geography, approximate configured
berths and simulated vessel positions. It supports selection, risk overlay,
playback and deterministic/simulated comparison schedules. A version-matched
same-origin worker and local schematic fallback keep it usable without tile access.
Markers preserve keyboard focus when playback or risk updates rebuild them.
