# Agent Collaboration Protocol (ACP)

This folder defines reusable JSON Schemas for the messages passed between the five Xyndicate agents:

| Agent | Schema |
| --- | --- |
| Oracle | `OracleReport.json` |
| Analyst | `AnalystAssessment.json` |
| Strategist | `StrategistDecision.json` |
| Executor | `ExecutorResult.json` |
| Narrator | `NarratorOutput.json` |

Each schema is draft-07 compliant and can be imported into any X Layer agent pipeline to validate payloads or auto-generate TypeScript types. This is the first iteration (`/acp/schema/v1/`); future seasons can extend the protocol without breaking changes by adding new versions alongside this folder.
