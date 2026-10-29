# Sage OS — Voice-First Autonomous AI for Independent Living

**1st Place — Hack-a-Bull 2026**

*Making computers accessible through conversation, while helping caregivers stay informed.*

[![Watch the Sage OS Demo](https://img.youtube.com/vi/r7cc46HNeUs/maxresdefault.jpg)](https://youtu.be/r7cc46HNeUs)

**[Watch the Full Demo](https://youtu.be/r7cc46HNeUs)**

---

## Overview

Sage OS is a voice-first, agentic AI system designed to help older adults and people with visual impairments navigate digital tasks independently.

Instead of requiring users to navigate complex websites, forms, menus, and applications, Sage allows them to express what they need in natural language. An AI agent interprets the request, coordinates the necessary tools, and executes supported workflows through a browser.

Sage also introduces a caregiver-facing experience that turns consented interactions into structured session histories, summaries, and insights.

The goal is simple: **make technology easier for the people using it and make meaningful information more accessible to the people supporting them.**

## The Problem

Many essential everyday activities now depend on navigating complicated digital interfaces.

For older adults, even straightforward tasks can become frustrating:

- Ordering healthcare supplies online
- Navigating appointment and pharmacy websites
- Completing forms and managing accounts
- Remembering instructions or previous interactions
- Coordinating everyday activities with family members

Traditional voice assistants can answer questions or execute predefined commands, but they often cannot reliably navigate multistep browser workflows while maintaining context.

Meanwhile, caregivers may lack a structured view of the interactions and difficulties their family members experience.

Sage brings these needs together in one system.

## Key Features

### 1. Voice-First Autonomous Computer Use

Sage accepts natural-language voice instructions and translates them into actionable browser workflows.

Its agent orchestration layer coordinates intent recognition, task planning, tool execution, and user-facing responses.

Supported workflow concepts include web navigation, form entry, product searches, and healthcare-related administrative tasks.

### 2. Multi-Agent Orchestration

Built around **LangGraph**, Sage separates responsibilities across specialized agent workflows rather than treating every interaction as a single chatbot response.

This enables stateful execution, task routing, and structured coordination between language models and browser tools.

### 3. Browser Automation

Sage uses browser automation and DOM-aware interaction to bridge the gap between natural-language requests and conventional websites.

The browser execution layer is designed around observable actions and controlled workflow progression.

### 4. Conversational Voice Interface

The voice experience combines speech recognition, language-model reasoning, and natural speech synthesis.

**ElevenLabs** provides the speech-output layer, helping users interact with Sage without depending on a traditional graphical interface.

### 5. Caregiver Context and Session Intelligence

Sage's caregiver experience is designed around structured interaction histories and consent-based insights.

The system architecture includes:

- Session and conversation records
- Structured patient and caregiver context
- Interaction summaries
- Transcript-based language signals
- Historical trend visualization
- Natural-language questions over caregiver data

The cognitive-signal functionality is intended to support awareness and follow-up, **not medical diagnosis**.

### 6. Human Oversight and Safety

Sensitive workflows require appropriate user or caregiver authorization.

Sage's design emphasizes explicit confirmation, privacy, and human oversight rather than unrestricted autonomous actions.

---

## System Architecture

```text
                    USER VOICE INPUT
                           |
                           v
                 Speech Recognition
                           |
                           v
                  LangGraph Supervisor
                           |
              +------------+------------+
              |                         |
              v                         v
       Task Planning              Context Retrieval
              |                         |
              v                         |
       Browser Execution <--------------+
              |
              v
       Workflow Result
              |
              v
       Voice Confirmation
              |
              v
         USER FEEDBACK


          CONSENTED SESSION DATA
                    |
                    v
            Snowflake Storage
                    |
                    v
          Session Analysis Layer
                    |
                    v
           Caregiver Dashboard
                    |
                    v
       Summaries, Trends, Queries
```

The architecture separates real-time user assistance from post-session caregiver analysis so that background processing does not unnecessarily interrupt the voice interaction.

## Technology Stack

| Layer | Technologies |
|---|---|
| AI orchestration | Python, LangGraph, OpenAI models |
| Browser automation | Playwright, Stagehand, Chromium |
| Voice processing | OpenAI speech recognition, ElevenLabs |
| Desktop experience | Electron, React, TypeScript |
| Caregiver interface | Next.js, React |
| Data platform | Snowflake |
| Analytics and queries | Snowpark, Snowflake Cortex Analyst |
| Communication | Socket.IO, event-driven messaging |

## Repository Structure

```text
sage-os/
├── backend/          # AI orchestration, services and integrations
├── frontend/         # User-facing application
├── .env.example      # Example environment configuration
├── env.example       # Additional environment template
├── run-all.ps1       # Development startup script
└── README.md
```

## Getting Started

### Prerequisites

Depending on which components you want to run, you may need:

- Python and the backend dependencies
- Node.js and the frontend dependencies
- OpenAI API credentials
- ElevenLabs API credentials
- Snowflake credentials for data-dependent functionality
- A supported Chromium browser

### Configuration

1. Clone the repository.

   ```bash
   git clone https://github.com/HUM4NITY/sage-os.git
   cd sage-os
   ```

2. Review the supplied environment templates:

   ```text
   .env.example
   env.example
   ```

3. Create the appropriate local environment configuration and supply the credentials required by the services you intend to use.

4. Install the backend and frontend dependencies according to their respective project configuration files.

5. On Windows, inspect `run-all.ps1` for the development startup sequence.

**Note:** This repository is a hackathon codebase. Some functionality may require external API credentials, configured services, or additional local setup. The project is not presented as a production-ready healthcare application.

## Privacy and Responsible AI

Sage is designed around assisted independence, not hidden monitoring.

Its intended operating principles include informed consent, controlled access to caregiver information, explicit confirmation of sensitive actions, and careful handling of personal data.

Transcript-derived cognitive indicators are informational signals only. They are not diagnoses, medical assessments, or substitutes for professional healthcare advice.

## Hack-a-Bull 2026

Sage OS was developed as a collaborative hackathon project and received **1st Place at Hack-a-Bull 2026**.

The project explores how agentic AI, accessible interfaces, browser automation, and structured caregiver intelligence can work together to solve a practical human problem.

## Demo and Source Code

**[Watch Sage OS on YouTube](https://youtu.be/r7cc46HNeUs)**

**[Explore the GitHub Repository](https://github.com/HUM4NITY/sage-os)**

---

*Built to make digital independence more accessible.*
