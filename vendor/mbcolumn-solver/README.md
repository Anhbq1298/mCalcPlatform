# MBColumn solver provenance

The core is copied from [MBColumnLite-API](https://github.com/Anhbq1298/MBColumnLite-API) at `1313a9317abb2b219448967d849eb22b20e441eb`. The only source change is the ES module export. mCalcPlatform invokes the core inside a dedicated browser worker. The server, CORS configuration, and deployment files stay in the upstream project.
