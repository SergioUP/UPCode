"use client";

import type { VaultGraphLink, VaultGraphNode } from "@upcode/contracts";
import { useEffect, useMemo, useRef, useState } from "react";
import ForceGraph3D, { type ForceGraphMethods, type NodeObject } from "react-force-graph-3d";
import * as THREE from "three";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";

import { observeResize } from "~/lib/observeResize";

import {
  BRAIN_BACKGROUND,
  createGlowTexture,
  createLabelTexture,
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

/** Additive halo strength: strong enough to dazzle, low enough not to saturate to white. */
const GLOW_OPACITY = { folder: 0.7, file: 0.55 } as const;

/** Degrees-per-frame-ish spin of the camera around the brain, like watching a globe turn. */
const SPIN_SPEED = 0.9;

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
  const [viewport, setViewport] = useState<{ width: number; height: number } | null>(null);

  const glowTexture = useMemo(() => {
    const canvas = createGlowTexture();
    if (canvas === null) return null;
    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    return texture;
  }, []);

  // One geometry per kind, scaled per node: thousands of dots, two buffers.
  const sharedGeometry = useMemo(
    () => ({
      file: new THREE.SphereGeometry(1, 8, 8),
      folder: new THREE.SphereGeometry(1, 14, 14),
      ring: new THREE.TorusGeometry(1.5, 0.055, 4, 28),
    }),
    [],
  );

  /** Labels and halos are built once per node and cached by id. */
  const nodeObjects = useRef(new Map<string, THREE.Object3D>());

  const graphData = useMemo(() => ({ nodes: [...nodes], links: [...links] }), [nodes, links]);
  const nodeById = useMemo(() => new Map(nodes.map((node) => [node.id, node])), [nodes]);

  const makeNodeObject = (node: BrainGraphNode): THREE.Object3D => {
    const radius = nodeRadius(node);
    const color = nodeColorCss(node, true);
    const group = new THREE.Group();
    const isFolder = node.kind === "folder";

    const sphere = new THREE.Mesh(
      isFolder ? sharedGeometry.folder : sharedGeometry.file,
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 1 }),
    );
    sphere.scale.setScalar(radius);
    group.add(sphere);

    // A bright orbital ring marks folder hubs without changing their graph role.
    if (isFolder) {
      const ring = new THREE.Mesh(
        sharedGeometry.ring,
        new THREE.MeshBasicMaterial({
          color,
          transparent: true,
          opacity: 0.62,
          depthWrite: false,
        }),
      );
      ring.scale.setScalar(radius);
      ring.rotation.x = Math.PI / 2.4;
      group.add(ring);
    }

    if (glowTexture !== null) {
      const halo = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: glowTexture,
          color,
          transparent: true,
          opacity: isFolder ? GLOW_OPACITY.folder : GLOW_OPACITY.file,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        }),
      );
      halo.scale.setScalar(radius * (isFolder ? 8 : 6.5));
      group.add(halo);
    }

    if (wantsLabel(node, detailed)) {
      const canvas = createLabelTexture(node.label, color);
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
          (child.material as THREE.MeshBasicMaterial).opacity =
            child.geometry instanceof THREE.TorusGeometry ? (lit ? 0.62 : 0.1) : lit ? 1 : 0.2;
        }
        if (child instanceof THREE.Sprite && child.material.map !== null) {
          if (child.material.map === glowTexture) {
            (child.material as THREE.SpriteMaterial).color.copy(color);
            (child.material as THREE.SpriteMaterial).opacity = lit
              ? isFolder
                ? GLOW_OPACITY.folder
                : GLOW_OPACITY.file
              : 0.04;
          } else {
            (child.material as THREE.SpriteMaterial).opacity = lit ? 1 : 0.12;
          }
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
    const bloom = new UnrealBloomPass(new THREE.Vector2(512, 512), 0.85, 0.9, 0.12);
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
    controls.autoRotateSpeed = SPIN_SPEED;
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
      const width = element.clientWidth;
      const height = element.clientHeight;
      setViewport((current) =>
        current?.width === width && current.height === height ? current : { width, height },
      );
      graphRef.current?.refresh();
    });
  }, []);

  return (
    <div ref={containerRef} className="absolute inset-0">
      <ForceGraph3D<BrainGraphNode, BrainLink>
        ref={graphRef}
        graphData={graphData}
        {...(viewport ?? {})}
        backgroundColor={BRAIN_BACKGROUND}
        showNavInfo={false}
        nodeThreeObject={nodeThreeObject}
        nodeLabel={() => ""}
        nodeResolution={detailed ? 12 : 8}
        linkColor={(link) => {
          // ForceGraph replaces endpoint ids with objects once the simulation starts.
          // Containment takes the child's colour, so folders no longer grey out every edge.
          for (const endpoint of [link.target, link.source]) {
            if (typeof endpoint === "string") {
              const node = nodeById.get(endpoint);
              if (node) return nodeColorCss(node, true);
            }
            if (typeof endpoint === "object" && endpoint !== null && "kind" in endpoint) {
              return nodeColorCss(endpoint as BrainGraphNode, true);
            }
          }
          return "#8da4cf";
        }}
        linkOpacity={0.35}
        // Width 0 draws cheap GL lines instead of a cylinder per edge.
        linkWidth={0}
        linkDirectionalParticles={0}
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
