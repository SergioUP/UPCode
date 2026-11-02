"use client";

import type { VaultGraphLink, VaultGraphNode } from "@t3tools/contracts";
import { useEffect, useMemo, useRef } from "react";
import ForceGraph3D, { type ForceGraphMethods, type NodeObject } from "react-force-graph-3d";
import * as THREE from "three";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";

import { observeResize } from "~/lib/observeResize";

import {
  BRAIN_BACKGROUND,
  clusterHue,
  createGlowTexture,
  createLabelTexture,
  folderClusterKey,
  nodeColorCss,
  nodeRadius,
  wantsLabel,
} from "./graphTheme";

export interface BrainGraphNode extends VaultGraphNode {
  /** Set by the force simulation; kept between scans so the picture does not jump. */
  x?: number;
  y?: number;
  z?: number;
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

    const sphere = new THREE.Mesh(
      new THREE.SphereGeometry(radius, 16, 16),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.95 }),
    );
    group.add(sphere);

    if (glowTexture !== null) {
      const halo = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: glowTexture,
          color,
          transparent: true,
          opacity: node.kind === "file" ? 0.4 : 0.6,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        }),
      );
      halo.scale.setScalar(radius * 7);
      group.add(halo);
    }

    if (wantsLabel(node, detailed)) {
      const canvas = createLabelTexture(node.label, "rgba(255,255,255,0.92)");
      if (canvas !== null) {
        const texture = new THREE.CanvasTexture(canvas);
        texture.needsUpdate = true;
        const sprite = new THREE.Sprite(
          new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false }),
        );
        const aspect = canvas.width / canvas.height;
        const height = node.kind === "file" ? 5 : 6.5;
        sprite.scale.set(height * aspect, height, 1);
        sprite.position.set(0, radius + height * 0.75, 0);
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
    for (const [id, object] of nodeObjects.current) {
      const node = nodes.find((candidate) => candidate.id === id);
      if (node === undefined) continue;
      const seen = highlightedIds === null || highlightedIds.has(id);
      const selected = selectedId === id;
      const color = new THREE.Color(nodeColorCss(node, seen || selected));
      object.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          (child.material as THREE.MeshBasicMaterial).color.copy(color);
          (child.material as THREE.MeshBasicMaterial).opacity = seen || selected ? 0.95 : 0.35;
        }
        if (child instanceof THREE.Sprite && child.material.map !== null) {
          if (child.material.map === glowTexture) {
            (child.material as THREE.SpriteMaterial).color.copy(color);
          }
          (child.material as THREE.SpriteMaterial).opacity = seen || selected ? 0.9 : 0.25;
        }
      });
      object.scale.setScalar(selected ? 1.6 : 1);
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
    const bloom = new UnrealBloomPass(new THREE.Vector2(1024, 1024), 0.85, 0.7, 0.05);
    composer.addPass(bloom);
    return () => {
      composer.removePass(bloom);
      bloom.dispose();
    };
  }, []);

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
    controls.autoRotateSpeed = 0.35;
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
          if (link.kind === "sameName") return "hsl(316 85% 68%)";
          // After the first tick the simulation replaces the endpoint ids with
          // the node objects themselves, which is where the folder lives.
          const source = link.source;
          if (typeof source === "object" && source !== null && "folder" in source) {
            const folder = String((source as BrainGraphNode).folder);
            return `hsl(${clusterHue(folderClusterKey(folder))} 65% 58%)`;
          }
          return "hsl(210 55% 55%)";
        }}
        linkOpacity={0.2}
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
