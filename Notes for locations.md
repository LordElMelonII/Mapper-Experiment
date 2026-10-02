# SillyTavern traveling ideas

## Current solution: Lookup tables

Example:
<walking_distances>
KEY: E:Emiya Residence|SD:Shopping District|Sc:Homurahara Academy|M:Matou Residence|T:Tohsaka Residence|RT:Ryuudou Temple|O:Outskirts|B:Fuyuki Bridge|S:Station Front|H:Harbor|GH:Ghost House (Edelfelt Mansion)|C:Kotomine Church|EC:Einzbern Castle|MT:Misaki Town

DIST(min):
E:SD12,Sc18,M22,T28,RT50,O30,B25,S50,H40,GH55,C60,EC270
SD:Sc10,M12,T15,RT45,O25,B15,S40,H40,GH40,C45,EC265
Sc:M15,T15,RT40,O15,B25,S50,H50,GH45,C55,EC255
M:T5,RT55,O20,B25,S55,H50,GH45,C50,EC260
T:RT60,O20,B25,S60,H55,GH45,C50,EC260
RT:O45,B60,S85,H80,GH85,C95,EC285
O:B35,S60,H65,GH50,C60,EC240
B:S25,H15,GH20,C35,EC275
S:H15,GH15,C20,EC300
H:GH25,C30,EC305
GH:C15,EC290
C:EC300

TRANSIT:
S:MT5h(train)
O:EC4h(walk),1h(car)
RT:Cavern3km(sub)
</walking_distances>

Issues: no cardinality, where is the user technically? Where does he move? North, East, West, South?

## Alternative proposals

### Coordinates

- Each location has coordinates.
- Need to find an algo for the path (A\*?)

### Cytoscape.js

New solution: implementing an extension visualizing the map as nodes and connecting them.
Suppose there's two towns: TownA and TownB. Distance on foot: 46 hours.

There's a volcano in the middle.

Management of nodes on a grid, still with coordinates. Creating zones. Giving locations a radius. Weights.

---

## Extension Specifications & Requirements

### 1. Spatial & Coordinate System

- **Canvas Coordinates**: Every location (node) must store model Cartesian coordinates `{ position: { x, y } }`.
- **Web Canvas Orientation**:
  - Origin `(0,0)` is at the top-left corner of the viewport.
  - Positive X ($\Delta x > 0$) $\rightarrow$ East.
  - Negative X ($\Delta x < 0$) $\rightarrow$ West.
  - Decreasing Y ($\Delta y < 0$) $\rightarrow$ North (upwards).
  - Increasing Y ($\Delta y > 0$) $\rightarrow$ South (downwards).
- **Dynamic Cardinality**: Calculate cardinal and intercardinal direction vectors between the player's current node and target nodes using $\Delta x = x_{\text{target}} - x_{\text{current}}$ and $\Delta y = y_{\text{target}} - y_{\text{current}}$.
- **Autocalculated Distances**:
  - Edge travel times can be computed automatically from Euclidean distance: $d = \sqrt{\Delta x^2 + \Delta y^2}$.
  - Configurable conversion ratio (e.g., $1\text{ px} = k\text{ minutes/hours}$) with optional terrain multipliers (roads, rivers, swamps).

### 2. Multi-Level Zones & Compound Nodes

- **Hierarchical Nesting**: Implement multi-tier regional scoping (World $\rightarrow$ Region $\rightarrow$ City $\rightarrow$ District $\rightarrow$ Point of Interest) using Cytoscape.js Compound Nodes (`parent: '<container_id>'`).
- **Bounding Boxes**: Containers must automatically encapsulate and resize around their inner locations.
- **Inter-City Transit**: Long-distance transport hubs (train stations, ports) connect directly leaf-to-leaf across different parent regions rather than as ambiguous macro-edges.

### 3. Pathfinding & Multimodal Transit

- **Pathfinding Engine**: Native route resolution using `cy.elements().aStar()` or `cy.elements().dijkstra()`.
- **Multi-Modal Weighting**: Edges must store granular metadata (`walkTime`, `carTime`, `trainTime`, `fareCost`).
- **Dynamic Costs**: The algorithm's `weight(edge)` callback must switch based on current vehicle/travel state:
  - Impassable routes for the active transport mode return `Infinity`.
  - Obstacles and narrative blockages (e.g., destroyed bridges, cave-ins) toggle a `status: 'blocked'` flag with an attached `reason` string, returning `Infinity` to pathfinding while remaining visible to the prompt engine.

### 4. Interactive Waypoints & Obstacle Bypass

- **Custom Waypoints**: Allow the player to click on empty canvas space (`cy.on('tap')`) to spawn temporary route nodes (`cy.add()`) to bypass terrain obstacles (such as mountains or volcanoes).
- **Automatic Re-routing**: Connect new waypoints to neighboring nodes, autocalculate distances based on click coordinates, and recalculate optimal paths.
- **Curved Edge Alternative**: Support unbundled bezier curves (`curve-style: 'unbundled-bezier'`) with control points to bend straight routes visually around obstacles without adding dummy nodes.

### 5. SillyTavern LLM Context Injection

- **Neighborhood Querying**: Extract valid immediate steps from the player's location using `node.outgoers().nodes()` and `node.edgesTo(target)`.
- **Structured Output**: Format the local map state into a clean context prompt for the LLM:
  ```xml
  <current_location>Emiya Residence</current_location>
  <region>Fuyuki City (Miyama)</region>
  <available_routes>
    - Shopping District (South-East, 12 min on foot)
    - Homurahara Academy (North-East, 18 min on foot)
    - Ryuudou Temple (North-West, 50 min on foot)
    - Big Bridge [BLOCKED: Bridge closed by local authorities]
  </available_routes>
  ```

### 6. Architecture & Framework Integration (Angular)

- **Separation of Concerns**:
  - `GraphService`: Angular `@Injectable()` service holding the active graph instance, running headless algorithms, and generating context prompts.
  - `GraphComponent`: Angular visual component hosting the canvas DOM container via `@ViewChild('cyContainer')`.
- **Lifecycle Management**:
  - Initialize Cytoscape inside `ngAfterViewInit` to guarantee container DOM availability.
  - Call `cy.destroy()` inside `ngOnDestroy` to clean up canvas instances and avoid memory leaks.
- **Change Detection Safety**: Wrap Cytoscape DOM events (`tap`, `select`, `drag`) in `ngZone.run()` to trigger Angular's change detection cycle when updating component state.
