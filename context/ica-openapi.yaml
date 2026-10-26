openapi: 3.0.3

info:
  title: IBM Consulting Advantage — Developer APIs
  description: |
    REST APIs for IBM Consulting Advantage. All endpoints are
    OpenAI-compatible where applicable.

    ## Authentication

    Every request must include your developer API key as an
    OpenAI-style bearer token in the `Authorization` header.

    Developer keys are issued from the ICA UI under
    *Settings → API Keys → ICA APIs*.

    ## Namespaces

    Chat-style endpoints are exposed under four namespaces:
    `assistants`, `agents`, `digital-workforce`, and `chat-models`.
    They share the same request/response shape.

    ## Files & Document Collections

    - **Files** — upload documents, then reference them in
      chat via `files: [{ "type": "file", "id": "<file-id>" }]`.
    - **Document Collections** — group multiple files into a single
      retrievable knowledge base, then reference with
      `files: [{ "type": "collection", "id": "<collection-id>" }]`.

    A file must finish text-extraction
    (`data.status == "completed"`) before it can be referenced in chat
    or attached to a collection. Poll
    `GET /ica/v1/files/{file_id}` after upload.

servers:
  - url: https://api.servicesessentials.ibm.com/v1

security:
  - DeveloperApiKey: []

tags:
  - name: Assistants
    description: Chat with assistants and list available assistants.
  - name: Agents
    description: Chat with agents and list available agents.
  - name: Digital Workforce
    description: Chat with digital workers and list available digital workers.
  - name: Chat Models
    description: Chat with raw models and list available chat models.
  - name: Files
    description: |
      Upload, list, retrieve, and delete files. Uploaded files can be
      referenced inline in chat completions or attached to document
      collections.
  - name: Document Collections
    description: |
      Create and manage retrieval collections (knowledge bases) of
      files. Reference a collection in a chat completion to enable
      retrieval-augmented generation across all of its files.
  - name: Tools
    description: |
      Create, discover and invoke available MCP (Model Context Protocol) tool servers.

paths:
  # ──────────────────────────── Assistants ────────────────────────────
  /assistants/chat/completions:
    post:
      tags: [Assistants]
      summary: Assistant chat completion
      description: Generate a chat completion using an assistant model.
      operationId: assistantsChatCompletion
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/ChatCompletionRequest'
            examples:
              plain:          { $ref: '#/components/examples/chatPlain' }
              withFile:       { $ref: '#/components/examples/chatWithFile' }
              withCollection: { $ref: '#/components/examples/chatWithCollection' }
      responses:
        '200': { $ref: '#/components/responses/ChatCompletion' }
        '400': { $ref: '#/components/responses/BadRequest' }
        '401': { $ref: '#/components/responses/Unauthorized' }
        '403': { $ref: '#/components/responses/Forbidden' }

  /assistants:
    get:
      tags: [Assistants]
      summary: List assistants
      description: Friendly alias for `GET /assistants/models`.
      operationId: listAssistantsAlias
      responses:
        '200': { $ref: '#/components/responses/ModelsList' }
        '401': { $ref: '#/components/responses/Unauthorized' }

  /assistants/models:
    get:
      tags: [Assistants]
      summary: List assistants (OpenAI-compatible)
      description: OpenAI-compatible `models.list` endpoint. Same response as `GET /assistants`.
      operationId: listAssistants
      responses:
        '200': { $ref: '#/components/responses/ModelsList' }
        '401': { $ref: '#/components/responses/Unauthorized' }

  # ────────────────────────────── Agents ──────────────────────────────
  /agents/chat/completions:
    post:
      tags: [Agents]
      summary: Agent chat completion
      operationId: agentsChatCompletion
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/ChatCompletionRequest'
            examples:
              plain:          { $ref: '#/components/examples/chatPlain' }
              withFile:       { $ref: '#/components/examples/chatWithFile' }
              withCollection: { $ref: '#/components/examples/chatWithCollection' }
      responses:
        '200': { $ref: '#/components/responses/ChatCompletion' }
        '400': { $ref: '#/components/responses/BadRequest' }
        '401': { $ref: '#/components/responses/Unauthorized' }
        '403': { $ref: '#/components/responses/Forbidden' }

  /agents:
    get:
      tags: [Agents]
      summary: List agents
      description: Friendly alias for `GET /agents/models`.
      operationId: listAgentsAlias
      responses:
        '200': { $ref: '#/components/responses/ModelsList' }
        '401': { $ref: '#/components/responses/Unauthorized' }

  /agents/models:
    get:
      tags: [Agents]
      summary: List agents (OpenAI-compatible)
      description: OpenAI-compatible `models.list` endpoint. Same response as `GET /agents`.
      operationId: listAgents
      responses:
        '200': { $ref: '#/components/responses/ModelsList' }
        '401': { $ref: '#/components/responses/Unauthorized' }

  # ───────────────────────── Digital Workforce ─────────────────────────
  /digital-workforce/chat/completions:
    post:
      tags: [Digital Workforce]
      summary: Digital worker chat completion
      operationId: digitalWorkforceChatCompletion
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/ChatCompletionRequest'
            examples:
              plain: { $ref: '#/components/examples/chatPlain' }
      responses:
        '200': { $ref: '#/components/responses/ChatCompletion' }
        '400': { $ref: '#/components/responses/BadRequest' }
        '401': { $ref: '#/components/responses/Unauthorized' }
        '403': { $ref: '#/components/responses/Forbidden' }

  /digital-workforce:
    get:
      tags: [Digital Workforce]
      summary: List digital workers
      description: Friendly alias for `GET /digital-workforce/models`.
      operationId: listDigitalWorkforceAlias
      responses:
        '200': { $ref: '#/components/responses/ModelsList' }
        '401': { $ref: '#/components/responses/Unauthorized' }

  /digital-workforce/models:
    get:
      tags: [Digital Workforce]
      summary: List digital workers (OpenAI-compatible)
      description: OpenAI-compatible `models.list` endpoint. Same response as `GET /digital-workforce`.
      operationId: listDigitalWorkforce
      responses:
        '200': { $ref: '#/components/responses/ModelsList' }
        '401': { $ref: '#/components/responses/Unauthorized' }

  # ──────────────────────────── Chat Models ────────────────────────────
  /chat-models/chat/completions:
    post:
      tags: [Chat Models]
      summary: Chat model completion
      operationId: chatModelsCompletion
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/ChatCompletionRequest'
            examples:
              plain:          { $ref: '#/components/examples/chatPlain' }
              withFile:       { $ref: '#/components/examples/chatWithFile' }
              withCollection: { $ref: '#/components/examples/chatWithCollection' }
      responses:
        '200': { $ref: '#/components/responses/ChatCompletion' }
        '400': { $ref: '#/components/responses/BadRequest' }
        '401': { $ref: '#/components/responses/Unauthorized' }
        '403': { $ref: '#/components/responses/Forbidden' }

  /chat-models:
    get:
      tags: [Chat Models]
      summary: List chat models
      description: Friendly alias for `GET /chat-models/models`.
      operationId: listChatModelsAlias
      responses:
        '200': { $ref: '#/components/responses/ModelsList' }
        '401': { $ref: '#/components/responses/Unauthorized' }

  /chat-models/models:
    get:
      tags: [Chat Models]
      summary: List chat models (OpenAI-compatible)
      description: OpenAI-compatible `models.list` endpoint. Same response as `GET /chat-models`.
      operationId: listChatModels
      responses:
        '200': { $ref: '#/components/responses/ModelsList' }
        '401': { $ref: '#/components/responses/Unauthorized' }

  # ───────────────────────────── Files ─────────────────────────────────
  /files:
    post:
      tags: [Files]
      summary: Upload a file
      description: |
        Upload a file via multipart form. The response returns the file
        record immediately; text extraction may continue
        asynchronously. Poll `GET /ica/v1/files/{file_id}` until
        `data.status == "completed"` before attaching the file to a
        collection or referencing it in chat.
      operationId: uploadFile
      requestBody:
        required: true
        content:
          multipart/form-data:
            schema:
              type: object
              required: [file]
              properties:
                file:
                  type: string
                  format: binary
      responses:
        '200':
          description: File uploaded.
          content:
            application/json:
              schema: { $ref: '#/components/schemas/FileObject' }
        '400': { $ref: '#/components/responses/BadRequest' }
        '401': { $ref: '#/components/responses/Unauthorized' }
    get:
      tags: [Files]
      summary: List your files
      operationId: listFiles
      responses:
        '200':
          description: Array of files.
          content:
            application/json:
              schema:
                type: array
                items: { $ref: '#/components/schemas/FileObject' }

  /files/{file_id}:
    parameters:
      - $ref: '#/components/parameters/FileId'
    get:
      tags: [Files]
      summary: Get file metadata
      operationId: getFile
      responses:
        '200':
          description: File record.
          content:
            application/json:
              schema: { $ref: '#/components/schemas/FileObject' }
        '404': { $ref: '#/components/responses/NotFound' }
    delete:
      tags: [Files]
      summary: Delete a file
      operationId: deleteFile
      responses:
        '200':
          description: Deletion result.
          content:
            application/json:
              schema:
                type: object
                properties:
                  success: { type: boolean, example: true }
        '404': { $ref: '#/components/responses/NotFound' }

  # ──────────────────────── Document Collections ───────────────────────
  /document-collections:
    post:
      tags: [Document Collections]
      summary: Create a document collection
      operationId: createCollection
      requestBody:
        required: true
        content:
          application/json:
            schema: { $ref: '#/components/schemas/CollectionCreateRequest' }
            examples:
              basic:
                value:
                  name: HR Policies
                  description: Employee handbook and onboarding documents
      responses:
        '200':
          description: Collection created.
          content:
            application/json:
              schema: { $ref: '#/components/schemas/Collection' }
        '400': { $ref: '#/components/responses/BadRequest' }
    get:
      tags: [Document Collections]
      summary: List document collections
      operationId: listCollections
      parameters:
        - in: query
          name: page
          schema: { type: integer, minimum: 1, default: 1 }
      responses:
        '200':
          description: Paginated list of collections.
          content:
            application/json:
              schema: { $ref: '#/components/schemas/CollectionList' }

  /document-collections/{id}:
    parameters:
      - $ref: '#/components/parameters/CollectionId'
    get:
      tags: [Document Collections]
      summary: Get a document collection (with files)
      operationId: getCollection
      responses:
        '200':
          description: Collection with hydrated `files`.
          content:
            application/json:
              schema: { $ref: '#/components/schemas/CollectionWithFiles' }
        '401': { $ref: '#/components/responses/Unauthorized' }
        '404': { $ref: '#/components/responses/NotFound' }
    delete:
      tags: [Document Collections]
      summary: Delete a document collection
      operationId: deleteCollection
      responses:
        '200':
          description: Deletion result (`true` on success).
          content:
            application/json:
              schema: { type: boolean, example: true }
        '400': { $ref: '#/components/responses/BadRequest' }

  /document-collections/{id}/file/add:
    parameters:
      - $ref: '#/components/parameters/CollectionId'
    post:
      tags: [Document Collections]
      summary: Attach a file to a collection
      description: |
        The referenced file must already exist **and** have completed
        processing (`data.status == "completed"`). Returns the updated
        collection.
      operationId: collectionAddFile
      requestBody:
        required: true
        content:
          application/json:
            schema: { $ref: '#/components/schemas/FileIdForm' }
      responses:
        '200':
          description: Updated collection.
          content:
            application/json:
              schema: { $ref: '#/components/schemas/CollectionWithFiles' }
        '400':
          description: |
            - `FILE_NOT_PROCESSED` — extraction still running
            - `NOT_FOUND` — file or collection does not exist
          content:
            application/json:
              schema: { $ref: '#/components/schemas/Error' }

  /document-collections/{id}/file/remove:
    parameters:
      - $ref: '#/components/parameters/CollectionId'
    post:
      tags: [Document Collections]
      summary: Detach a file from a collection
      description: |
        Detaches a file from the collection. By default the underlying
        file is also deleted from storage; pass `delete_file=false` to
        keep the file usable elsewhere.
      operationId: collectionRemoveFile
      parameters:
        - in: query
          name: delete_file
          description: Also delete the underlying file from storage.
          required: false
          schema: { type: boolean, default: true }
      requestBody:
        required: true
        content:
          application/json:
            schema: { $ref: '#/components/schemas/FileIdForm' }
      responses:
        '200':
          description: Updated collection.
          content:
            application/json:
              schema: { $ref: '#/components/schemas/CollectionWithFiles' }
        '400':
          description: File not associated with the collection.
          content:
            application/json:
              schema: { $ref: '#/components/schemas/Error' }

  # ──────────────────────────────── Tools ─────────────────────────────
  /tools:
    get:
      tags: [Tools]
      summary: List MCP tool servers
      description: |
        Lists the MCP tool servers visible to your API key: all public
        servers plus your team's own servers. Each entry includes a
        ready-to-use `connection` config — paste it into a standard MCP
        client (MCP Inspector, Claude Code/Desktop, opencode) and replace
        the bearer placeholder with your developer API key.

        The per-server `tools` list is omitted by default; pass
        `?return_tools=true` to include it.
      operationId: listTools
      parameters:
        - in: query
          name: return_tools
          required: false
          description: Include each server's `tools` array in the response.
          schema: { type: boolean, default: false }
      responses:
        '200':
          description: List of MCP servers visible to the caller.
          content:
            application/json:
              schema:
                type: array
                items: { $ref: '#/components/schemas/McpServer' }
        '400': { $ref: '#/components/responses/BadRequest' }
        '401': { $ref: '#/components/responses/Unauthorized' }

    post:
      tags: [Tools]
      summary: Create an MCP tool server
      description: |
        Register a new MCP tool server scoped to your team. For non-OAuth
        servers, the upstream is connected immediately — tools are
        discovered and the server becomes active. For OAuth servers, the
        server is created in `pending_authorization` status and the
        response includes an `authorizationUrl` to complete the OAuth
        flow.
      operationId: createToolServer
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/CreateToolServerRequest'
            examples:
              bearer:
                summary: Server with bearer token auth
                value:
                  name: "My Jira Server"
                  upstreamUrl: "https://mcp.example.com/jira/mcp"
                  description: "Jira issue tracker"
                  authType: "bearer"
                  authToken: "my-secret-token"
              oauth:
                summary: Server with OAuth
                value:
                  name: "GitHub MCP"
                  upstreamUrl: "https://mcp.example.com/github/mcp"
                  description: "GitHub integration"
                  authType: "oauth"
                  oauthConfig:
                    clientId: "abc123"
                    clientSecret: "secret"
                    authorizeUrl: "https://github.com/login/oauth/authorize"
                    tokenUrl: "https://github.com/login/oauth/access_token"
                    scopes: "repo,read:user"
              noAuth:
                summary: Server with no auth
                value:
                  name: "Public Tools"
                  upstreamUrl: "https://mcp.example.com/public/mcp"
                  description: "Publicly accessible tools"
      responses:
        '201':
          description: Server created successfully.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/CreateToolServerResponse'
        '400': { $ref: '#/components/responses/BadRequest' }
        '401': { $ref: '#/components/responses/Unauthorized' }
        '502':
          description: |
            Upstream MCP server or ContextForge failed to provision the
            gateway/virtual server.
          content:
            application/json:
              schema: { $ref: '#/components/schemas/Error' }

  /tools/{id}:
    parameters:
      - in: path
        name: id
        required: true
        description: The server record id (the `id` from `POST /tools` or `GET /tools`).
        schema: { type: string }
    put:
      tags: [Tools]
      summary: Update an MCP tool server
      description: |
        Update metadata on a team-owned MCP server. Only servers owned by
        your team can be updated. Structural fields (upstream URL, CF ids,
        source) cannot be changed — only display metadata and auth
        credentials.
      operationId: updateToolServer
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/UpdateToolServerRequest'
            examples:
              rename:
                summary: Rename a server
                value:
                  name: "My Renamed Server"
                  description: "Updated description"
              updateAuth:
                summary: Rotate bearer token
                value:
                  authType: "bearer"
                  authToken: "new-secret-token"
      responses:
        '200':
          description: Server updated successfully.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/CreateToolServerResponse'
        '400': { $ref: '#/components/responses/BadRequest' }
        '401': { $ref: '#/components/responses/Unauthorized' }
        '403':
          description: Server is not owned by your team.
          content:
            application/json:
              schema: { $ref: '#/components/schemas/Error' }
        '404': { $ref: '#/components/responses/NotFound' }
    delete:
      tags: [Tools]
      summary: Delete an MCP tool server
      description: |
        Delete a team-owned MCP server. Tears down the ContextForge
        gateway and virtual server, removes the OpenWebUI tool-server
        connection, drops visibility rows, and deletes the registry
        record. Only servers owned by your team can be deleted.
      operationId: deleteToolServer
      responses:
        '200':
          description: Server deleted successfully.
          content:
            application/json:
              schema:
                type: object
                properties:
                  status:
                    type: string
                    example: deleted
        '401': { $ref: '#/components/responses/Unauthorized' }
        '403':
          description: Server is not owned by your team.
          content:
            application/json:
              schema: { $ref: '#/components/schemas/Error' }
        '404': { $ref: '#/components/responses/NotFound' }

  /tools/search:
    get:
      tags: [Tools]
      summary: Search tools
      description: |
        Search across server names, descriptions, and individual tool
        names/descriptions. Returns the same shape as `GET /tools` but
        with the `tools` array always populated and filtered to only the
        tools that matched the query. Servers that matched on name or
        description (but not a specific tool) include their full tool
        list.
      operationId: searchTools
      parameters:
        - in: query
          name: q
          required: true
          description: |
            Search query. Matches against server name, server description,
            tool name, and tool description (case-insensitive substring).
          schema: { type: string }
        - in: query
          name: page
          required: false
          description: Zero-based page index.
          schema: { type: integer, default: 0 }
        - in: query
          name: size
          required: false
          description: Page size (max 100).
          schema: { type: integer, default: 20, maximum: 100 }
      responses:
        '200':
          description: Matching MCP servers with tools filtered to the query.
          content:
            application/json:
              schema:
                type: array
                items: { $ref: '#/components/schemas/McpServer' }
        '400': { $ref: '#/components/responses/BadRequest' }
        '401': { $ref: '#/components/responses/Unauthorized' }

  /tools/{cfServerId}/mcp:
    parameters:
      - in: path
        name: cfServerId
        required: true
        description: |
          The MCP server id from the `connection.url` in `GET /tools`.
          Clients should treat this as an opaque identifier.
        schema: { type: string }
    post:
      tags: [Tools]
      summary: Invoke MCP server (JSON-RPC)
      description: |
        MCP streamable-HTTP transport. Send a JSON-RPC 2.0 request
        (e.g. `initialize`, `tools/list`, `tools/call`). The response is
        either a single JSON body or a Server-Sent Events stream,
        depending on the method. The `Mcp-Session-Id` header is
        round-tripped for multi-message sessions.

        This is a transparent MCP endpoint — point any standard MCP
        client at this URL with your developer API key as the bearer
        token rather than calling it by hand.
      operationId: invokeToolServer
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              description: A JSON-RPC 2.0 request object.
            examples:
              initialize:
                summary: Initialize an MCP session
                value:
                  jsonrpc: "2.0"
                  id: 1
                  method: initialize
                  params:
                    protocolVersion: "2025-03-26"
                    capabilities: {}
                    clientInfo: { name: my-agent, version: "1.0" }
              toolsList:
                summary: List the server's tools
                value:
                  jsonrpc: "2.0"
                  id: 2
                  method: tools/list
      responses:
        '200':
          description: |
            JSON-RPC response (single JSON object) or an SSE stream of
            MCP messages.
          content:
            application/json:
              schema:
                type: object
                description: A JSON-RPC 2.0 response object.
            text/event-stream:
              schema:
                type: string
                description: SSE stream of MCP protocol messages.
        '401': { $ref: '#/components/responses/Unauthorized' }
        '404': { $ref: '#/components/responses/NotFound' }
    get:
      tags: [Tools]
      summary: Open MCP server-to-client stream (SSE)
      description: |
        Opens the MCP server-to-client Server-Sent Events stream for an
        established session. Supply the `Mcp-Session-Id` returned by the
        `initialize` call.
      operationId: openToolServerStream
      responses:
        '200':
          description: SSE stream of MCP protocol messages.
          content:
            text/event-stream:
              schema:
                type: string
        '401': { $ref: '#/components/responses/Unauthorized' }
        '404': { $ref: '#/components/responses/NotFound' }

components:
  securitySchemes:
    DeveloperApiKey:
      type: http
      scheme: bearer
      bearerFormat: ICA-API-Key
      description: |
        ICA developer API key, passed as `Authorization: Bearer sk-...`.
        Create one from the ICA UI under *Settings → API Keys → ICA APIs*.

  parameters:
    FileId:
      in: path
      name: file_id
      required: true
      description: File identifier returned by `POST /ica/v1/files`.
      schema: { type: string }
    CollectionId:
      in: path
      name: id
      required: true
      description: Document collection identifier.
      schema: { type: string }

  responses:
    BadRequest:
      description: Validation error.
      content:
        application/json:
          schema: { $ref: '#/components/schemas/Error' }
    Unauthorized:
      description: Missing, unknown, or revoked API key.
      content:
        application/json:
          schema: { $ref: '#/components/schemas/Error' }
    Forbidden:
      description: Key valid but not entitled to this resource.
      content:
        application/json:
          schema: { $ref: '#/components/schemas/Error' }
    NotFound:
      description: Resource not found.
      content:
        application/json:
          schema: { $ref: '#/components/schemas/Error' }
    ChatCompletion:
      description: OpenAI-compatible chat completion.
      content:
        application/json:
          schema: { $ref: '#/components/schemas/ChatCompletionResponse' }
        text/event-stream:
          schema:
            type: string
            description: |
              Server-Sent Events stream. Each event payload is a JSON
              chunk in OpenAI streaming format
              (`{ "choices": [{ "delta": { "content": "..." }}]}`),
              terminated by a final `[DONE]` event.
    ModelsList:
      description: List of models in the OpenAI `models.list` shape.
      content:
        application/json:
          schema: { $ref: '#/components/schemas/ModelsResponse' }

  examples:
    chatPlain:
      summary: Plain chat
      value:
        model: agent-finance-helper
        messages:
          - role: user
            content: Summarise our Q1 spend.
        stream: false
    chatWithFile:
      summary: Reference an uploaded file
      value:
        model: agent-finance-helper
        messages:
          - role: user
            content: What does this contract say about renewals?
        stream: false
        files:
          - type: file
            id: f1a2b3c4-1111-2222-3333-444455556666
    chatWithCollection:
      summary: Reference a document collection
      value:
        model: agent-finance-helper
        messages:
          - role: user
            content: Summarise the onboarding policy.
        stream: false
        files:
          - type: collection
            id: kb-aaaa-bbbb-cccc-dddd

  schemas:
    Error:
      type: object
      properties:
        detail:
          type: string

    ChatMessage:
      type: object
      required: [role, content]
      properties:
        role:
          type: string
          enum: [system, user, assistant, tool]
        content:
          type: string

    FileRef:
      type: object
      required: [type, id]
      description: |
        Reference to a file or a document collection to ground the
        completion in. Multiple entries can be mixed in the same array.
      properties:
        type:
          type: string
          enum: [file, collection]
        id:
          type: string
          description: File id or collection id.
        name:
          type: string
          description: Optional display label.
        context:
          type: string
          enum: [full]
          description: |
            (Collections only) When set to `full`, inject every file's
            full text instead of doing semantic retrieval. Token-heavy;
            use only for small collections.

    ChatCompletionRequest:
      type: object
      required: [model, messages]
      properties:
        model:
          type: string
          description: Model id returned by the matching `*/models` endpoint.
        messages:
          type: array
          items: { $ref: '#/components/schemas/ChatMessage' }
        stream:
          type: boolean
          default: false
          description: |
            When `true`, the response is `text/event-stream`
            (Server-Sent Events).
        temperature: { type: number, minimum: 0, maximum: 2 }
        top_p: { type: number, minimum: 0, maximum: 1 }
        max_tokens: { type: integer, minimum: 1 }
        files:
          type: array
          description: Files and/or collections to ground the completion in.
          items: { $ref: '#/components/schemas/FileRef' }

    ChatCompletionChoice:
      type: object
      properties:
        index: { type: integer }
        finish_reason:
          type: string
          enum: [stop, length, content_filter, tool_calls]
        message: { $ref: '#/components/schemas/ChatMessage' }

    Usage:
      type: object
      properties:
        prompt_tokens:     { type: integer }
        completion_tokens: { type: integer }
        total_tokens:      { type: integer }

    Source:
      type: object
      description: |
        A retrieved source chunk used to ground the completion. Present
        only when `files` / `collection` were attached.
      properties:
        source:
          type: object
          properties:
            name: { type: string }
        document:
          type: array
          items: { type: string }
        metadata:
          type: array
          items:
            type: object
            additionalProperties: true

    ChatCompletionResponse:
      type: object
      properties:
        id:      { type: string, example: chatcmpl-abc123 }
        object:  { type: string, example: chat.completion }
        created: { type: integer, example: 1715000000 }
        model:   { type: string }
        choices:
          type: array
          items: { $ref: '#/components/schemas/ChatCompletionChoice' }
        usage: { $ref: '#/components/schemas/Usage' }
        sources:
          type: array
          description: Retrieved sources (only when files/collections are attached).
          items: { $ref: '#/components/schemas/Source' }

    Model:
      type: object
      properties:
        id:       { type: string }
        name:     { type: string }
        object:   { type: string, example: model }
        created:  { type: integer }
        owned_by: { type: string, example: ica }
        info:
          type: object
          properties:
            meta:
              type: object
              properties:
                description: { type: string }
                tags:
                  type: array
                  items: { type: string }

    ModelsResponse:
      type: object
      properties:
        data:
          type: array
          items: { $ref: '#/components/schemas/Model' }

    FileObject:
      type: object
      properties:
        id:       { type: string }
        filename: { type: string }
        hash:     { type: string }
        data:
          type: object
          properties:
            status:
              type: string
              enum: [pending, processing, completed, failed]
              description: |
                Poll until `completed` before referencing the file in
                chat or attaching to a collection.
        meta:
          type: object
          properties:
            name:         { type: string }
            content_type: { type: string }
            size:         { type: integer }
        created_at: { type: integer, example: 1715000000 }
        updated_at: { type: integer, example: 1715000000 }

    AccessGrant:
      type: object
      description: Per-principal access grant on a collection.
      properties:
        principal_type:
          type: string
          enum: [user, group]
        principal_id:
          type: string
          description: |
            Principal id, or `*` for "everyone" (public). Public
            sharing requires the `sharing.public_knowledge` permission
            on the calling user.
        permission:
          type: string
          enum: [read, write]

    CollectionCreateRequest:
      type: object
      required: [name]
      properties:
        name:        { type: string }
        description: { type: string }
        data:
          type: object
          additionalProperties: true
        access_grants:
          type: array
          items: { $ref: '#/components/schemas/AccessGrant' }

    Collection:
      type: object
      properties:
        id:          { type: string }
        name:        { type: string }
        description: { type: string }
        data:
          type: object
          properties:
            file_ids:
              type: array
              items: { type: string }
        meta:
          type: object
          nullable: true
        access_grants:
          type: array
          items: { $ref: '#/components/schemas/AccessGrant' }
        created_at: { type: integer }
        updated_at: { type: integer }

    CollectionWithFiles:
      allOf:
        - $ref: '#/components/schemas/Collection'
        - type: object
          properties:
            files:
              type: array
              description: Hydrated file metadata for files in this collection.
              items: { $ref: '#/components/schemas/FileObject' }
            write_access:
              type: boolean
              description: Whether the caller may modify this collection.

    CollectionListItem:
      type: object
      properties:
        id:           { type: string }
        name:         { type: string }
        description:  { type: string }
        write_access: { type: boolean }
        created_at:   { type: integer }
        updated_at:   { type: integer }

    CollectionList:
      type: object
      properties:
        items:
          type: array
          items: { $ref: '#/components/schemas/CollectionListItem' }
        total: { type: integer }

    FileIdForm:
      type: object
      required: [file_id]
      properties:
        file_id:
          type: string
          description: Id of a previously uploaded, fully-processed file.

    McpTool:
      type: object
      description: A single tool exposed by an MCP server.
      properties:
        id:
          type: string
        name:
          type: string
          description: MCP-form tool name (namespaced).
        originalName:
          type: string
          description: The tool's original name on the upstream server.
        description:
          type: string

    McpServer:
      type: object
      description: |
        An MCP tool server you can use. Use the `connection` object to
        configure a standard MCP client, replacing the bearer placeholder
        with your developer API key. Only servers you can actually connect
        to are listed (servers requiring credentials you have not connected
        are omitted).
      properties:
        id:
          type: string
          description: |
            Server record id. Use for `PUT /tools/{id}` and
            `DELETE /tools/{id}`.
        name:
          type: string
        description:
          type: string
        connection:
          type: object
          description: |
            Ready-to-use MCP client connection config (streamable HTTP).
            Paste into the `mcpServers` entry of a standard MCP client
            (MCP Inspector, Claude Code/Desktop, opencode), replacing the
            placeholder with your developer API key.
          properties:
            type:
              type: string
              description: Transport type; `http` (streamable HTTP remote server).
              example: http
            url:
              type: string
              description: The MCP server endpoint.
            headers:
              type: object
              additionalProperties:
                type: string
              description: |
                Request headers. Includes `Authorization: Bearer
                <YOUR_ICA_API_KEY>` — substitute your own developer API key.
              example:
                Authorization: "Bearer <YOUR_ICA_API_KEY>"
        transport:
          type: string
          description: MCP transport type (e.g. `STREAMABLEHTTP`, `SSE`).
        toolCount:
          type: integer
        tools:
          type: array
          description: |
            The server's tools. Omitted unless the request passes
            `?return_tools=true`.
          items: { $ref: '#/components/schemas/McpTool' }

    CreateToolServerRequest:
      type: object
      required: [name, upstreamUrl]
      description: Request body for creating an MCP tool server.
      properties:
        name:
          type: string
          description: Display name for the server.
        upstreamUrl:
          type: string
          description: |
            The upstream MCP server URL to connect to. This is the remote
            server that exposes the tools.
        description:
          type: string
          description: Optional description of the server.
        transport:
          type: string
          description: MCP transport type.
          default: STREAMABLEHTTP
          enum: [STREAMABLEHTTP, SSE]
        authType:
          type: string
          description: |
            Authentication type for the upstream server. Omit or set to
            `null` for unauthenticated servers.
          enum: [bearer, basic, authheaders, oauth]
        authToken:
          type: string
          description: Bearer token (when `authType=bearer`).
        authUsername:
          type: string
          description: Username (when `authType=basic`).
        authPassword:
          type: string
          description: Password (when `authType=basic`).
        authHeaders:
          type: array
          description: |
            Custom headers (when `authType=authheaders`). Each entry is a
            `{key, value}` pair sent to the upstream on every request.
          items:
            type: object
            properties:
              key: { type: string }
              value: { type: string }
        oauthConfig:
          type: object
          description: OAuth configuration (when `authType=oauth`).
          properties:
            clientId: { type: string }
            clientSecret: { type: string }
            authorizeUrl: { type: string }
            tokenUrl: { type: string }
            redirectUrl: { type: string }
            issuerUrl: { type: string }
            scopes: { type: string }

    CreateToolServerResponse:
      type: object
      description: |
        The created server. For non-OAuth servers this is immediately
        active with tools populated. For OAuth servers, the status is
        `pending_authorization` and `authorizationUrl` is provided to
        complete the flow.
      properties:
        id:
          type: string
          description: The ICA server record id.
        name:
          type: string
        status:
          type: string
          description: |
            `active` for non-OAuth servers (ready to use) or
            `pending_authorization` for OAuth servers (authorization
            required).
          enum: [active, pending_authorization]
        upstreamUrl:
          type: string
        authType:
          type: string
        toolCount:
          type: integer
        url:
          type: string
          description: |
            MCP connection URL for the server (present only when active).
            Connect any MCP client to this URL with your developer API key
            as the bearer token.
        authorizationUrl:
          type: string
          description: |
            OAuth authorization URL (present only when
            `status=pending_authorization`). Open this URL in a browser to
            complete the OAuth flow, then call
            `POST /tools/{id}/refresh` to activate.
        tools:
          type: array
          description: Discovered tools (present when active and tools exist).
          items: { $ref: '#/components/schemas/McpTool' }

    UpdateToolServerRequest:
      type: object
      description: |
        Fields to update on an existing MCP server. All fields are optional;
        only provided fields are changed. Structural fields (upstreamUrl,
        source, ownerTeamId, CF ids) cannot be modified.
      properties:
        name:
          type: string
          description: New display name.
        description:
          type: string
          description: New description.
        status:
          type: string
          description: New status (e.g. `active`, `disabled`).
        authType:
          type: string
          description: Updated auth type.
          enum: [bearer, basic, authheaders, oauth]
        authToken:
          type: string
          description: New bearer token (when `authType=bearer`).
        authUsername:
          type: string
          description: New username (when `authType=basic`).
        authPassword:
          type: string
          description: New password (when `authType=basic`).
        authHeaders:
          type: array
          description: New custom headers (when `authType=authheaders`).
          items:
            type: object
            properties:
              key: { type: string }
              value: { type: string }
        oauthConfig:
          type: object
          description: Updated OAuth configuration (when `authType=oauth`).
          properties:
            clientId: { type: string }
            clientSecret: { type: string }
            authorizeUrl: { type: string }
            tokenUrl: { type: string }
            redirectUrl: { type: string }
            issuerUrl: { type: string }
            scopes: { type: string }
