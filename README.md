# SmartMaint AI — Predictive Maintenance Platform

A systems analysis and design project: a full-stack concept for an AI-powered predictive maintenance platform that uses IoT sensor data to predict equipment failures before they happen.

Built as an end-to-end systems analysis — from requirements gathering and architecture design through to a working interactive prototype.

---

## What it does

SmartMaint AI monitors industrial equipment in real time and predicts failures before they cause downtime. Plant managers see a unified dashboard of all assets, technicians get prioritized work orders, and executives see ROI and uptime metrics — all driven by simulated machine learning predictions on live sensor data.

**Core features in the prototype:**
- Real-time sensor monitoring dashboard (temperature, vibration, pressure)
- Asset health scoring with predictive failure alerts
- Work order management with priority badges
- Role-based views (Plant Manager, Technician, Executive)
- KPI tracking, alert feeds, dynamic charts
- Persistent state across pages

## Tech & concepts covered

- **Frontend** — vanilla HTML/CSS/JavaScript, no framework dependencies
- **Architecture** — multi-page SPA with persistent state and live data updates
- **Systems analysis** — full requirements doc, ERD, DFD, architecture diagrams, implementation roadmap
- **Domain** — IoT, predictive maintenance, ML pipeline design, cloud architecture

## What's in this repo

| File | Purpose |
|------|---------|
| `SmartMaint_Prototype.html` | Working interactive prototype — open in any browser |
| `SmartMaint_AI_Proposal_Final.pdf` | Full systems analysis report |
| `SmartMaint_Presentation.pptx` | Stakeholder presentation deck |

## Try the prototype

Download `SmartMaint_Prototype.html` and open it in any browser. No installation, no dependencies.

## Roadmap

This started as a course project but has real potential. Future improvements:
- Python/FastAPI backend with SQLite for actual server-side persistence
- Real-time sensor data simulation using setInterval
- Actual ML model (scikit-learn) trained on synthetic equipment failure data
- Deployment to a live URL

---

**Built by Muhammad Mustafa** · Computer Science, Montclair State University
