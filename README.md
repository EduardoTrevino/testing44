# ExpertLabelGDO: High-Fidelity Geospatial Annotation Platform - System Architecture & Operations Manual

> **System Designation:** ExpertLabelGDO Platform
> **Operational Status:** `Online` | **Version:** 2.0 (Self-Contained Persistence Architecture)
> **Engineering Domain:** AI & Modeling
> **Classification:** `Internal Business System`

### Table of Contents

*   [**0.0 System Design & Architectural Synthesis**](#00-system-design--architectural-synthesis)
    *   [0.1 High-Level Architectural Diagram](#01-high-level-architectural-diagram)
    *   [0.2 Data Flow & Interaction Synthesis](#02-data-flow--interaction-synthesis)
    *   [0.3 Core Components Deep Dive](#03-core-components-deep-dive)
        *   [0.3.1. Geospatial Subsystem](#031-geospatial-subsystem)
        *   [0.3.2. Persistence Subsystem](#032-persistence-subsystem)
        *   [0.3.3. API & Security Boundary](#033-api--security-boundary)
*   [**1.0 Strategic Mandate & System Overview**](#10-strategic-mandate--system-overview)
*   [**2.0 Core Architectural Pillars & Design Philosophy**](#20-core-architectural-pillars--design-philosophy)
    *   [2.1 Principle of Hermeticity & Environmental Agnosticism](#21-principle-of-hermeticity--environmental-agnosticism)
    *   [2.2 Principle of Ephemeral, Stateless Execution](#22-principle-of-ephemeral-stateless-execution)
    *   [2.3 Principle of Segregated Client-Server Responsibilities](#23-principle-of-segregated-client-server-responsibilities)
    *   [2.4 Principle of Declarative State & GitOps Integration](#24-principle-of-declarative-state--gitops-integration)
*   [**3.0 In-Depth System Architecture**](#30-in-depth-system-architecture)
    *   [3.1 Technology & Toolchain Specification](#31-technology--toolchain-specification)
    *   [3.2 Multi-Layer System Breakdown](#32-multi-layer-system-breakdown)
        *   [3.2.1. Presentation Layer (Client-Side)](#321-presentation-layer-client-side)
        *   [3.2.2. Application Logic & API Gateway Layer (Server-Side)](#322-application-logic--api-gateway-layer-server-side)
        *   [3.2.3. Persistence & Data Layer (Server-Side)](#323-persistence--data-layer-server-side)
*   [**4.0 Operational Lifecycle & Data Management**](#40-operational-lifecycle--data-management)
    *   [4.1 Automated Deployment via GitOps](#41-automated-deployment-via-gitops)
    *   [4.2 Adding New Substations for Annotation (Data Ingestion Workflow)](#42-adding-new-substations-for-annotation-data-ingestion-workflow)
*   [**5.0 Advanced System Components & Future Evolution**](#50-advanced-system-components--future-evolution)
    *   [5.1 Private Tile Serving & Remote S3 Integration Strategy](#51-private-tile-serving--remote-s3-integration-strategy)
    *   [5.2 System Evolution & Architectural Considerations](#52-system-evolution--architectural-considerations)

## 0.0 System Design & Architectural Synthesis

This document elucidates the architecture of the **ExpertLabelGDO** platform, a specialized, high-fidelity system for geospatial annotation. The design prioritizes **operational autonomy, data integrity, and a hermetic, infrastructure-agnostic deployment model**. It is engineered to function as a self-contained entity within a Kubernetes-native environment, deliberately eschewing dependencies on external managed services for its core data persistence and tile-serving functionalities.

The system is a **monolithic Next.js application** that logically segregates concerns into three primary layers: a dynamic Presentation Layer, a stateless API Gateway & Logic Layer, and a file-based Persistence Layer. This monolithic-but-layered approach was chosen to simplify the deployment topology and reduce inter-service communication overhead while maintaining strict internal boundaries.

### 0.1 High-Level Architectural Diagram

```ascii
+-----------------------------------------------------------------------------------+
| User's Browser (Untrusted Environment)                                            |
| +-------------------------------------------------------------------------------+ |
| | Presentation Layer (Next.js Client Components)                                | |
| | +-----------------+  +-----------------+  +---------------------------------+ | |
| | | UI State Mgmt   |  |   Geospatial    |  |       Workflow Components       | | |
| | |   (Zustand)     |  | Rendering Engine|  | (AnnotateTab, CompleteTab, etc.)| | |
| | +-----------------+  |    (Leaflet)    |  +---------------------------------+ | |
| +----------------------|-----------------|--------------------------------------+ |
+-----------^----------------------------|--------------------------^-------------+
            |                            |                          |
            | (3) HTTPS/POST             | (2) HTTPS/GET            | (1) HTTPS/GET
            | (Data Mutation)            | (Tile Request)           | (Data Fetch)
            v                            v                          v
+-----------------------------------------------------------------------------------+
| Kubernetes Cluster (Trusted, Private Network)                                     |
| +-------------------------------------------------------------------------------+ |
| | Kubernetes Pod: expertlabel-gdo-xxxxxxxx-xxxxx                                | |
| | +---------------------------------------------------------------------------+ | |
| | | Next.js Application Container (Stateless)                                 | | |
| | | +-----------------------------------------------------------------------+ | | |
| | | | API Gateway & Logic Layer (Next.js Route Handlers)                    | | | |
| | | | +------------------+ +-----------------+ +--------------------------+ | | | |
| | | | | Data Persistence | | Tile Serving API| | Business Logic           | | | | |
| | | | | API (/api/...)   | | (/api/tiles/...) | | (Validation, etc.)       | | | | |
| | | | +--------|---------+ +--------|--------+ +--------------------------+ | | | |
| | | +----------|--------------------|--------------------------------------+ | | |
| | |            |                    |                                       | | |
| | |            | (A) I/O Ops        | (B) Read-Only I/O                     | | |
| | |            v                    v                                       | | |
| | | +-----------------------------------------------------------------------+ | | |
| | | | Data Access Layer (DAL) (`lib/data.ts` - Node.js `fs/promises`)         | | | |
| | | +-----------------------------------------------------------------------+ | | |
| | | +-----------------------------------------------------------------------+ | | |
| | | | Container Filesystem (Read-Only Image Layers)                         | | | |
| | | | - /usr/src/app/public/tiles/... (Seed Tile Data)                      | | | |
| | | | - /usr/src/app/app/data/...   (Seed Annotation Data)                  | | | |
| | | +-----------------------------------------------------------------------+ | | |
| | +--------------------------------|------------------------------------------+ | |
| +----------------------------------|--------------------------------------------+ |
|                                    | (C) Volume Mount: /usr/src/app/app/data    |
|                                    v                                            |
| +-------------------------------------------------------------------------------+ |
| | Kubernetes Persistence Subsystem                                              | |
| | +---------------------------------------------------------------------------+ | |
| | | Persistent Volume (e.g., Azure Disk)                                      | | |
| | | - /substations.json  (Live, Canonical Data)                              | | | |
| | | - /component_polygons.json (Live, Canonical Data)                         | | | |
| | +---------------------------------------------------------------------------+ | |
| +-------------------------------------------------------------------------------+ |
+-----------------------------------------------------------------------------------+
```

### 0.2 Data Flow & Interaction Synthesis

1.  **Initial Data Hydration (`GET /dashboard` -> `GET /api/substations`)**: The client-side application initiates, triggering a `fetch` request to its server-side API gateway. The gateway's handler invokes the DAL.
2.  **Tile Rendering (`GET /api/tiles/...`)**: The Leaflet engine, upon receiving substation geometry, calculates and requests the necessary raster tiles. The Tile Serving API intercepts these requests, performs TMS coordinate translation, and reads the corresponding PNG files from the container's read-only `public/tiles` directory.
3.  **Data Mutation (`POST /api/polygons`)**: An annotation save action triggers a **pessimistic "read-modify-write"** cycle. The client first `GET`s the latest state of `component_polygons.json`, modifies the received array in memory, and then `POST`s the entire, new array back to the API.
    *   **(A) I/O Ops:** The Data Persistence API's `POST` handler invokes the DAL.
    *   **(C) Volume Mount:** The DAL's `writeFile` operation is transparently redirected by the Kubernetes volume mount.
    *   The `component_polygons.json` file on the **Persistent Volume** is atomically overwritten with the new state. This guarantees that the file is never in a partially-written or corrupted state.

### 0.3 Core Components Deep Dive

#### 0.3.1. Geospatial Subsystem

The platform's primary function revolves around its geospatial capabilities, which are composed of three distinct parts:
*   **Vector Data Model (GeoJSON):** All user-generated annotations are stored and manipulated as `Polygon` or `MultiPolygon` features compliant with the GeoJSON standard (RFC 7946). This ensures interoperability with a vast ecosystem of GIS tools. The canonical data store is a flat `FeatureCollection`-like array within `component_polygons.json`.
*   **Raster Data Model (TMS):** High-resolution aerial imagery is pre-processed into a Tile Map Service (TMS) pyramid. This standard slices the imagery into a quadtree of `256x256` pixel PNG files, allowing the client to efficiently request only the tiles visible within its current viewport and zoom level. This is essential for delivering performant rendering of multi-gigabyte source images over the web.
*   **Rendering & Interaction Engine (Leaflet):** The client utilizes the battle-tested Leaflet library as its rendering engine. `MapLeaflet.tsx` is a complex abstraction that orchestrates the rendering of multiple layers: a global basemap, the context-specific TMS overlay, and the dynamic GeoJSON vector annotations. It also encapsulates the drawing controls, capturing user input and transforming it into valid GeoJSON geometry.

#### 0.3.2. Persistence Subsystem

The choice of a file-based persistence model is a deliberate engineering trade-off. It prioritizes operational simplicity, declarative state management, and infrastructure independence over the raw write performance and complex query capabilities of a traditional RDBMS.
*   **Atomicity via Overwrite:** The system achieves transactional integrity for write operations by always reading the entire dataset, modifying it in memory, and writing the entire dataset back. This atomic overwrite, facilitated by the underlying POSIX filesystem guarantees, prevents data corruption.
*   **Data Seeding & Immutability:** The initial "seed" state of the data is baked into the immutable Docker image within `app/data/`. A Kubernetes **Init Container** performs a one-time, idempotent copy of this seed data to the persistent volume upon the very first pod instantiation, bootstrapping the system.
*   **Stateful Workload Management:** The Kubernetes `Deployment` is coupled with a `PersistentVolumeClaim`. This declaratively instructs the cluster to provision a durable, network-attached storage volume (e.g., Azure Disk) and ensure it is exclusively mounted into the application pod. This correctly treats the application as a stateful workload, where the compute is ephemeral but the data is persistent and has a lifecycle independent of the pod.

#### 0.3.3. API & Security Boundary

The Next.js Route Handlers constitute the sole security and logic boundary for the system.
*   **No Direct Client Access:** The client environment has zero access to the persistence layer. All interactions are forced through the API, providing a single point for future implementation of authentication, authorization, and input validation.
*   **Server-Side Logic:** All code that interacts with the filesystem or performs sensitive operations (like TMS coordinate calculations) resides exclusively within the `app/api/` or `lib/` directories and is guaranteed by the Next.js compiler to never be bundled and sent to the client browser.

## 1.0. Strategic Mandate & System Overview

**ExpertLabelGDO** is a mission-critical, in-house developed platform engineered to facilitate the high-throughput, precision annotation of geospatial imagery. The system provides an interactive, web-based environment for subject matter experts (SMEs) to perform semantic segmentation by delineating and classifying intricate components within complex scenes, such as electrical substations. The structured, high-fidelity data generated by this platform serves as the foundational ground-truth for training sophisticated deep learning and computer vision models, directly supporting strategic initiatives in automated infrastructure monitoring and analysis.

This document serves as the definitive technical reference for the platform, detailing its sophisticated architecture, intrinsic design philosophies, complex data flow patterns, and the fully automated operational lifecycle. It is intended for senior engineering staff, architects, and security personnel responsible for the system's continued evolution, operational stability, and architectural integrity. The content herein presumes a comprehensive understanding of container orchestration, modern web frameworks, distributed systems principles, and geospatial data concepts (TMS, GeoJSON).

The platform is architected as a fully containerized, hermetic system deployed within the organization's managed Kubernetes infrastructure. Its design emphasizes **portability, statelessness, and declarative management**, ensuring robust, repeatable, and secure operation without reliance on external, third-party data services.

---

## 2.0. Core Architectural Pillars & Design Philosophy

The architecture of ExpertLabelGDO is the deliberate product of several core engineering principles designed to ensure long-term viability, security, and maintainability in a demanding enterprise environment.

*   **2.1. Principle of Hermeticity & Environmental Agnosticism:** The entire platform is designed as a self-contained system. All components necessary for its operation—application runtime, logic, data persistence, and even high-resolution map tile serving—are managed within the Kubernetes cluster. This eliminates dependencies on external managed services, cloud-provider-specific APIs, or network-accessible databases, rendering the system exceptionally portable and resilient to external network failures.

*   **2.2. Principle of Ephemeral, Stateless Execution:** The application containers are engineered to be completely stateless and ephemeral. They are treated as immutable, replaceable compute units. All long-lived state, specifically the corpus of user-generated annotation data, is rigorously externalized to the orchestration layer's persistence subsystem. This paradigm is fundamental to achieving zero-downtime deployments via rolling updates, intrinsic self-healing capabilities, and horizontal scalability.

*   **2.3. Principle of Segregated Client-Server Responsibilities:** The system enforces a hardened boundary between the client-side presentation layer and the server-side logic. The client environment (the user's browser) is considered an untrusted, zero-privilege execution context. It is architecturally incapable of directly interacting with the persistence layer or the tile data source. All state mutations and data requests are brokered through a dedicated, hardened API gateway (Next.js Route Handlers), which provides a controlled, auditable interface for all data I/O operations.

*   **2.4. Principle of Declarative State & GitOps Integration:** The entire desired state of the application, from its source code and dependencies to its complete infrastructure and runtime configuration, is declaratively defined and version-controlled within this Git repository. The running state of the production system is a direct, verifiable reflection of the `development` branch. This GitOps methodology ensures that every change is auditable, repeatable, and can be automatically reconciled by the CI/CD pipeline, eliminating configuration drift and manual intervention.

---

## 3.0. In-Depth System Architecture

### 3.1. Technology & Toolchain Specification

*   **Core Framework:** Next.js 14+ (App Router)
*   **Primary Language:** TypeScript (Strict Mode Enforced)
*   **User Interface:** React 18
*   **Component Primitives:** shadcn/ui
*   **Client-Side State:** Zustand
*   **Geospatial Rendering Engine:** Leaflet, `react-leaflet`, `react-leaflet-draw`
*   **Geospatial Data Formats:** GeoJSON (for vector annotations), TMS (for raster tile overlays)
*   **Containerization:** Docker
*   **Orchestration:** Kubernetes

### 3.2. Multi-Layer System Breakdown

#### 3.2.1. Presentation Layer (Client-Side)

The user experience is a sophisticated single-page application (SPA) focused on minimizing latency and maximizing interactivity for the annotation workflow.

*   **Component Kernels (`AnnotateTab.tsx`, `CompleteTab.tsx`):** These are the primary "smart" components. They manage the complex local UI state (dialogs, forms, map modes) and orchestrate all data flow by making asynchronous network requests to the server-side API layer. They are the command center for the user's workflow.

*   **Geospatial Engine (`MapLeaflet.tsx`):** This is a highly specialized component responsible for the entire visual and interactive map experience.
    *   **Multi-Layer Rendering:** It renders a composite view consisting of a global base layer (ESRI World Imagery) and, when a specific substation is selected, a high-resolution raster overlay served by our private tile API. This layering provides both global context and sub-centimeter detail for precise annotation.
    *   **Vector Data Visualization:** It dynamically renders all `ComponentPolygon` vector data (as GeoJSON features) for the selected substation, applying distinct styling based on `label` and `from_osm` properties to differentiate between user-generated annotations and reference data.
    *   **Interactive Drawing:** It integrates `react-leaflet-draw` to provide the user with tools for creating new polygonal geometries, emitting the resulting GeoJSON through callbacks to the parent `AnnotateTab`.

#### 3.2.2. Application Logic & API Gateway Layer (Server-Side)

This layer runs within the Kubernetes pod and serves as the trusted, secure backend. It exposes three distinct API namespaces.

*   **Data Persistence API (`/api/substations` & `/api/polygons`):**
    *   **`GET` Handlers:** Service read requests by invoking the Data Access Layer to retrieve the full content of the respective JSON data files from the persistent volume.
    *   **`POST` Handlers:** Service write requests. They expect a request body containing a complete, valid JSON array. This "full overwrite" strategy ensures data atomicity and simplicity.

*   **Geospatial Tile Server API (`/api/tiles/[...all]/route.ts`):**
    *   **Function:** This is a custom-built, dynamic Tile Map Service (TMS) endpoint. It is responsible for serving the high-resolution, private aerial imagery overlays (we are currently using Vexcel but could be others, same vibe).
    *   **Dynamic Routing:** It uses Next.js's catch-all routes to parse incoming tile requests in the format `/api/tiles/{full_id}/{z}/{x}/{y}.png`.
    *   **Coordinate System Translation:** It performs on-the-fly vertical (Y-axis) coordinate conversion from the standard XYZ scheme used by Leaflet to the TMS specification required to locate the file on disk (`yToUse = (1 << z) - 1 - y`).
    *   **File System I/O:** It securely constructs a file path to the requested tile image within the `public/tiles` directory (inside the container) and serves the raw PNG data with the correct `image/png` content type. This internalizes the tile-serving, removing the need for an external tile server or S3 bucket, reinforcing the system's hermetic design.

#### 3.2.3. Persistence & Data Layer (Server-Side)

This is the foundational layer for all stateful information in the system.

*   **Data Access Module (`lib/data.ts`):** A server-only module abstracting all file system operations. It exposes a clean, promise-based API (`getSubstations`, `writePolygons`, etc.) and is the only module in the system that directly uses Node.js's `fs/promises`.

*   **Canonical Data Models (`lib/types.ts`):** A centralized, single source of truth for the system's data structures (`SubstationData`, `ComponentPolygon`). This ensures type consistency across the entire stack, from the database file to the API layer to the frontend components.

*   **Data Store:**
    *   **`substations.json`:** The master list of annotation targets. Each entry contains a UUID, boundary geometry (Polygon), and metadata.
    *   **`component_polygons.json`:** A denormalized, flat list of all annotations. Each entry is linked to its parent via a `substation_uuid`.
    *   **`public/tiles/`:** A directory containing the high-resolution imagery, structured in a standard TMS `Z/X/Y.png` format within subdirectories named after the substation's `full_id`.

*   **Kubernetes Persistent Volume:** The physical and logical storage unit managed by the orchestrator. The `volumeMounts` configuration in the deployment manifest maps this persistent disk to `/usr/src/app/app/data`, transparently redirecting all I/O from `lib/data.ts`.

---

## 4.0. Operational Lifecycle & Data Management

### 4.1. Automated Deployment via GitOps

The platform adheres to a strict GitOps philosophy. The deployment pipeline is fully automated and requires no manual intervention.

*   **CI/CD Workflow (`.github/workflows/development.yaml`):**
    *   **Build Stage:** Triggers on a push to `development`. Performs a cloud-based Docker build (`az acr build`), which compiles the Next.js application, including the API handlers, and packages the entire `app` directory (with the `public/tiles` data) into an immutable Docker image.
    *   **Deployment Stage:** Applies the Kubernetes manifests using a rolling update strategy for zero downtime.

*   **Persistent Data Bootstrapping (The Init Container):** The deployment manifest includes an **Init Container** that runs before the main application. It uses an idempotent script to copy the seed `substations.json` and `component_polygons.json` files from the image to the persistent volume **only if the volume is new and empty**. This ensures that initial data is present on first launch, and that subsequent deployments re-attach to the volume without overwriting existing user data.

### 4.2. Adding New Substations for Annotation (Data Ingestion Workflow)

Adding new annotation tasks to the system is a deliberate, version-controlled process that leverages the GitOps pipeline.

1.  **Data Preparation:** The GIS data team prepares two sets of assets for the new substation:
    *   A new entry in the `substations.json` file. This includes a newly generated UUID, the boundary polygon in GeoJSON format, and any relevant metadata. The `completed` flag must be set to `false`.
    *   The corresponding high-resolution imagery, processed and sliced into a TMS tile set (`Z/X/Y.png`).

2.  **Commit to Repository:**
    *   The new tile set directory (named after the substation's `full_id`) is placed into the `public/tiles/` directory.
    *   The `substations.json` file is updated with the new entry.

3.  **Git Push & Automated Deployment:** These changes are committed and pushed to the `development` branch of the Git repository. This action automatically triggers the CI/CD pipeline. A new Docker image is built containing the new substation entry and its associated tiles. The new image is then deployed to Kubernetes.

4.  **Availability:** Once the deployment is complete, the new substation will automatically appear in the "Annotate" tab for all users, ready for annotation. The private tile server API will begin serving its high-resolution imagery.

---

## 5.0. Advanced System Components & Future Evolution

### 5.1. Private Tile Serving & Remote S3 Integration Strategy

The current implementation utilizes a built-in tile server that serves images packaged within the Docker container. This is highly reliable and performant for a moderate number of static tile sets. A future enhancement involves integrating with a remote S3 bucket managed by PNNL for a more scalable and decoupled tile storage solution.

*   **Current State (`PrivateTileLayer.tsx`):** This component is currently disabled in `MapLeaflet.tsx` in favor of the local API. However, it contains the complete logic for fetching tiles from a private S3 bucket. It uses the AWS SDK (`@aws-sdk/client-s3`) to generate pre-signed URLs for each tile request on the fly. This ensures that the S3 bucket can remain fully private, with no public read access.

*   **Required S3 Bucket Policy for Integration:** To enable this feature, the target S3 bucket (`pnnl-bucket-name`) would require a specific IAM policy attached to the service principal/user whose credentials the application uses. This policy must grant minimal, read-only permissions.

    **Example IAM Policy:**
    ```json
    {
        "Version": "2012-10-17",
        "Statement": [
            {
                "Effect": "Allow",
                "Action": "s3:GetObject",
                "Resource": "arn:aws:s3:::pnnl-bucket-name/frontend/tiles/*"
            }
        ]
    }
    ```
    This policy grants permission *only* to read objects (`GetObject`) within the specified `frontend/tiles/` prefix, adhering to the principle of least privilege. Once this policy is in place, the `PrivateTileLayer` component can be enabled to provide a more scalable tile-serving solution.

### 5.2. System Evolution & Architectural Considerations

While the current architecture is robust and precisely scaled for its purpose, the following evolutionary paths are available.

*   **Concurrency at Scale:** The "read-modify-write" file persistence model is highly effective for a small number of concurrent users. If the user base grows significantly, a file-locking mechanism (e.g., creating a `.lock` file during write operations) could be implemented in the API layer to prevent race conditions.

*   **Data Validation & Schema Enforcement:** To further harden the system against data corruption, a schema validation library like Zod could be implemented within the `POST` API handlers. This would ensure that any data written to disk strictly conforms to the canonical types defined in `lib/types.ts`.

*   **db:** The clean abstraction provided by the API layer and the `lib/data.ts` module creates a single, well-defined seam for a future database integration if performance or query requirements demand it. A managed, private database resource could be provisioned within the same virtual network as the Kubernetes cluster. The functions within `lib/data.ts` could then be refactored to use a database client to perform transactional SQL queries. This transition must be approached with extreme caution, particularly regarding the handling of sensitive geospatial data, to ensure adherence to all organizational data governance and security policies. The introduction of a new data store would necessitate a thorough security review and a carefully managed data migration strategy.