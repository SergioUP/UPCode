"use client";

import type { VaultGraphLink, VaultGraphNode } from "@t3tools/contracts";
import { useEffect, useMemo, useRef } from "react";
import ForceGraph3D, { type ForceGraphMethods, type NodeObject } from "react-force-graph-3d";
import * as THREE from "three";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";

import { observeResize } from "~/lib/observeResize";

import {
  BRAIN_BACKGROUND,
  createGlowTexture,
  createLabelTexture,
  fileExtensionColor,
  folderColor,
  nodeColorCss,
  nodeRadius,
  wantsLabel,
} from "./graphTheme";

export interface BrainGraphNode extends VaultGraphNode {
  /** Set by the force simulation; kept between scans so the picture does not jump. */
  x?: number;
  y?: number;
  z?: number;
  vx?: number;
  vy?: number;
  vz?: number;
}

export interface BrainLink {
  readonly source: string;
  readonly target: string;
  readonly kind: VaultGraphLink["kind"];
}

export interface BrainSceneProps {
  readonly nodes: ReadonlyArray<BrainGraphNode>;
  readonly links: ReadonlyArray<BrainLink>;
  readonly selectedId: string | null;
  /** Nodes matching the search, or every node when there is no search. */
  readonly highlightedIds: ReadonlySet<string> | null;
  /**
   * False for a big vault: labels and particles are the first things to go when
   * a graph is too large for them to be readable anyway.
   */
  readonly detailed: boolean;
  readonly autoRotate: boolean;
  readonly onSelect: (id: string | null) => void;
  readonly onHover: (id: string | null) => void;
}

type GraphHandle = ForceGraphMethods<NodeObject<BrainGraphNode>, BrainLink>;

/**
 * The volume every dot is pulled onto: wide across, deeper front-to-back and a
 * little flatter than tall, which is the silhouette that reads as a brain
 * rather than as a ball. Units are the simulation's, not pixels.
 */
const BRAIN_SHELL = { x: 74, y: 52, z: 62 } as const;

/**
 * The brain.
 *
 * `react-force-graph-3d` owns the simulation and the camera; this file owns what
 * the vault looks like: a glowing sphere per node, a halo behind it, a label on
 * the ones worth reading, and a bloom pass so the whole thing reads as light
 * rather than geometry.
 */
export function BrainScene({
  nodes,
  links,
  selectedId,
  highlightedIds,
  detailed,
  autoRotate,
  onSelect,
  onHover,
}: BrainSceneProps) {
  const graphRef = useRef<GraphHandle | undefined>(undefined);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const glowTexture = useMemo(() => {
    const canvas = createGlowTexture();
    if (canvas === null) return null;
    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    return texture;
  }, []);

  /** Labels and halos are built once per node and cached by id. */
  const nodeObjects = useRef(new Map<string, THREE.Object3D>());

  const graphData = useMemo(() => ({ nodes: [...nodes], links: [...links] }), [nodes, links]);

  const makeNodeObject = (node: BrainGraphNode): THREE.Object3D => {
    const radius = nodeRadius(node);
    const color = nodeColorCss(node, true);
    const group = new THREE.Group();
    const isFolder = node.kind === "folder";

    const sphere = new THREE.Mesh(
      new THREE.SphereGeometry(radius, isFolder ? 18 : 10, isFolder ? 18 : 10),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 1 }),
    );
    group.add(sphere);

    // A thin ring keeps a folder readable as a hub without turning it into a
    // lamp: the folders are the skeleton, the files are the light.
    if (isFolder) {
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(radius * 1.5, radius * 0.055, 6, 40),
        new THREE.MeshBasicMaterial({
          color,
          transparent: true,
          opacity: 0.38,
          depthWrite: false,
        }),
      );
      ring.rotation.x = Math.PI / 2.4;
      group.add(ring);
    }

    if (glowTexture !== null) {
      const halo = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: glowTexture,
          color,
          transparent: true,
          // Dim on purpose: a bright halo per node washes the black out.
          opacity: isFolder ? 0.16 : 0.3,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        }),
      );
      halo.scale.setScalar(radius * (isFolder ? 4.5 : 6));
      group.add(halo);
    }

    if (wantsLabel(node, detailed)) {
      const canvas = createLabelTexture(node.label, "rgba(255,255,255,0.94)");
      if (canvas !== null) {
        const texture = new THREE.CanvasTexture(canvas);
        texture.needsUpdate = true;
        const sprite = new THREE.Sprite(
          new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false }),
        );
        const aspect = canvas.width / canvas.height;
        const height = isFolder ? 8 : 5;
        sprite.scale.set(height * aspect, height, 1);
        sprite.position.set(0, radius + height * 0.7, 0);
        group.add(sprite);
      }
    }

    return group;
  };

  const nodeThreeObject = (rawNode: NodeObject<BrainGraphNode>): THREE.Object3D => {
    const node = rawNode as BrainGraphNode;
    const cached = nodeObjects.current.get(node.id);
    if (cached !== undefined) return cached;
    const created = makeNodeObject(node);
    nodeObjects.current.set(node.id, created);
    return created;
  };

  // Node colour carries the search: a match keeps its cluster hue, everything
  // else fades, which is what makes a query readable in a 3D cloud.
  useEffect(() => {
    const byId = new Map(nodes.map((node) => [node.id, node]));
    for (const [id, object] of nodeObjects.current) {
      const node = byId.get(id);
      if (node === undefined) continue;
      const seen = highlightedIds === null || highlightedIds.has(id);
      const selected = selectedId === id;
      const lit = seen || selected;
      const color = new THREE.Color(nodeColorCss(node, lit));
      const isFolder = node.kind === "folder";
      object.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          (child.material as THREE.MeshBasicMaterial).color.copy(color);
          (child.material as THREE.MeshBasicMaterial).opacity = lit ? 1 : isFolder ? 0.35 : 0.22;
        }
        if (child instanceof THREE.Sprite && child.material.map !== null) {
          if (child.material.map === glowTexture) {
            (child.material as THREE.SpriteMaterial).color.copy(color);
          }
          (child.material as THREE.SpriteMaterial).opacity = lit ? 0.55 : 0.12;
        }
      });
      object.scale.setScalar(selected ? 1.55 : 1);
    }
  }, [nodes, highlightedIds, selectedId, glowTexture]);

  // Dropped notes must not keep dragging the simulation from their cached object.
  useEffect(() => {
    const alive = new Set(nodes.map((node) => node.id));
    for (const id of nodeObjects.current.keys()) {
      if (!alive.has(id)) nodeObjects.current.delete(id);
    }
  }, [nodes]);

  // Switching level of detail rebuilds the objects: labels are inside them.
  useEffect(() => {
    nodeObjects.current.clear();
  }, [detailed]);

  // Bloom is what turns a cloud of spheres into a brain lit from inside.
  useEffect(() => {
    const graph = graphRef.current;
    if (graph === undefined) return;
    const composer = graph.postProcessingComposer();
    const bloom = new UnrealBloomPass(new THREE.Vector2(1024, 1024), 0.28, 0.55, 0.55);
    composer.addPass(bloom);
    return () => {
      composer.removePass(bloom);
      bloom.dispose();
    };
  }, []);

  /**
   * The shape. A spring layout alone spreads a vault into a flat cloud; this
   * shell pulls every node onto the surface of a wide ellipsoid, which is what
   * makes it read as a brain: deeper than tall, rounder at the sides, and with
   * the folders trapped in the same volume as their files.
   *
   * The repulsion is weakened at the same time: the shell does the shaping and
   * charge only keeps dots from stacking.
   */
  useEffect(() => {
    const graph = graphRef.current;
    if (graph === undefined) return;
    const charge = graph.d3Force("charge") as { strength?: (value: number) => unknown } | undefined;
    charge?.strength?.(-16);

    const shell = (alpha: number) => {
      const strength = 0.32 * alpha;
      for (const node of graphData.nodes) {
        const nx = (node.x ?? 0) / BRAIN_SHELL.x;
        const ny = (node.y ?? 0) / BRAIN_SHELL.y;
        const nz = (node.z ?? 0) / BRAIN_SHELL.z;
        const distance = Math.hypot(nx, ny, nz);
        if (distance < 1e-6) continue;
        // Positive inside the shell, negative outside it: the surface is a
        // fixed point, so a node neither collapses to the middle nor escapes.
        const push = (1 - distance) * strength;
        node.vx = (node.vx ?? 0) + (nx / distance) * push;
        node.vy = (node.vy ?? 0) + (ny / distance) * push;
        node.vz = (node.vz ?? 0) + (nz / distance) * push;
      }
    };
    graph.d3Force("brain-shell", shell as never);
    graph.d3ReheatSimulation();
  }, [graphData]);

  // Orbit controls come from three-render-objects; the auto-rotation and the
  // damping are the only two knobs worth touching here.
  useEffect(() => {
    const graph = graphRef.current;
    if (graph === undefined) return;
    const controls = graph.controls() as {
      autoRotate?: boolean;
      autoRotateSpeed?: number;
      enableDamping?: boolean;
      dampingFactor?: boolean | number;
    };
    controls.autoRotate = autoRotate;
    controls.autoRotateSpeed = 0.28;
    controls.enableDamping = true;
  }, [autoRotate]);

  useEffect(() => {
    const graph = graphRef.current;
    if (graph === undefined) return;
    // Frame the whole brain once, then let the reader own the camera.
    const timer = window.setTimeout(() => graph.zoomToFit(900, 70), 400);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    const element = containerRef.current;
    if (element === null) return;
    // react-force-graph sizes itself from the container, but a panel that
    // resizes without a window resize event needs a nudge.
    return observeResize(element, () => {
      graphRef.current?.refresh();
    });
  }, []);

  return (
    <div ref={containerRef} className="absolute inset-0">
      <ForceGraph3D<BrainGraphNode, BrainLink>
        ref={graphRef}
        graphData={graphData}
        backgroundColor={BRAIN_BACKGROUND}
        showNavInfo={false}
        nodeThreeObject={nodeThreeObject}
        nodeLabel={() => ""}
        nodeResolution={detailed ? 12 : 8}
        linkColor={(link) => {
          // A cross-folder name link keeps its own colour; a containment link
          // borrows the colour of the file it hangs from, so an edge reads as
          // part of its dot's cluster.
          if (link.kind === "sameName") return "hsl(316 90% 70%)";
          const source = link.source;
          if (typeof source === "object" && source !== null && "kind" in source) {
            const node = source as BrainGraphNode;
            return node.kind === "file"
              ? fileExtensionColor(node.extension)
              : folderColor(node.depth, true);
          }
          return "hsl(210 20% 40%)";
        }}
        linkOpacity={0.12}
        linkWidth={(link) => (link.kind === "sameName" ? 0.7 : 0.35)}
        linkDirectionalParticles={(link) => (detailed && link.kind === "sameName" ? 2 : 0)}
        linkDirectionalParticleWidth={1.4}
        linkDirectionalParticleSpeed={0.004}
        linkDirectionalParticleColor={() => "rgba(255,255,255,0.55)"}
        d3AlphaDecay={0.014}
        d3VelocityDecay={0.32}
        warmupTicks={40}
        cooldownTicks={600}
        enableNodeDrag={false}
        onNodeClick={(node) => onSelect(String(node.id))}
        onNodeHover={(node) => onHover(node === null ? null : String(node.id))}
        onBackgroundClick={() => onSelect(null)}
      />
    </div>
  );
}
