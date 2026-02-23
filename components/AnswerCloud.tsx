'use client'

import { useEffect, useRef, useCallback } from 'react'
import * as d3 from 'd3'
import { AnswerGroup } from '@/lib/gameLogic'

interface NodeDatum extends d3.SimulationNodeDatum {
  id: string
  group: AnswerGroup
  radius: number
  color: string
}

interface Props {
  groups: AnswerGroup[]
  revealed: boolean
  width: number
  height: number
}

// Colour palette — vibrant HSL family
const BASE_COLORS = [
  [210, 85],  // blue
  [160, 80],  // teal
  [280, 75],  // purple
  [340, 80],  // pink
  [35,  85],  // orange
  [145, 70],  // green
  [195, 80],  // cyan
]

function pickColor(index: number, saturationBoost: number): string {
  const [h, s] = BASE_COLORS[index % BASE_COLORS.length]
  const sat = Math.min(100, s + saturationBoost * 20)
  return `hsl(${h}, ${sat}%, 55%)`
}

export default function AnswerCloud({ groups, revealed, width, height }: Props) {
  const svgRef = useRef<SVGSVGElement>(null)
  const simRef = useRef<d3.Simulation<NodeDatum, undefined> | null>(null)
  const nodesRef = useRef<NodeDatum[]>([])
  const colorMapRef = useRef<Map<string, string>>(new Map())

  const maxCount = Math.max(1, ...groups.map((g) => g.count))

  // Assign stable colour per answer
  groups.forEach((g, i) => {
    if (!colorMapRef.current.has(g.normalised)) {
      const satBoost = (g.count - 1) / maxCount
      colorMapRef.current.set(g.normalised, pickColor(colorMapRef.current.size, satBoost))
    }
  })

  const buildNodes = useCallback((): NodeDatum[] => {
    return groups.map((g) => {
      const existing = nodesRef.current.find((n) => n.id === g.normalised)
      const satBoost = (g.count - 1) / maxCount
      const radius = 40 + (g.count / maxCount) * 60  // 40–100px

      return {
        id: g.normalised,
        group: g,
        radius,
        color: pickColor(
          groups.findIndex((gg) => gg.normalised === g.normalised),
          satBoost
        ),
        x: existing?.x ?? width / 2 + (Math.random() - 0.5) * 100,
        y: existing?.y ?? height / 2 + (Math.random() - 0.5) * 100,
        vx: existing?.vx ?? 0,
        vy: existing?.vy ?? 0,
      }
    })
  }, [groups, maxCount, width, height])

  // Initial simulation setup
  useEffect(() => {
    if (!svgRef.current) return

    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()

    const defs = svg.append('defs')

    // Gradient mask for blurred reveal
    defs.append('filter')
      .attr('id', 'blur-text')
      .append('feGaussianBlur')
      .attr('in', 'SourceGraphic')
      .attr('stdDeviation', revealed ? 0 : 8)

    const container = svg.append('g').attr('class', 'cloud-container')

    const nodes = buildNodes()
    nodesRef.current = nodes

    const sim = d3.forceSimulation<NodeDatum>(nodes)
      .force('center', d3.forceCenter(width / 2, height / 2).strength(0.08))
      .force('charge', d3.forceManyBody().strength(-20))
      .force('collide', d3.forceCollide<NodeDatum>((d) => d.radius + 8).strength(0.9).iterations(4))
      .force('x', d3.forceX(width / 2).strength(0.04))
      .force('y', d3.forceY(height / 2).strength(0.04))
      .alphaDecay(0.02)

    simRef.current = sim

    // Build DOM groups
    const nodeGroups = container
      .selectAll<SVGGElement, NodeDatum>('g.node')
      .data(nodes, (d) => d.id)
      .join(
        (enter) => {
          const g = enter.append('g').attr('class', 'node blob-enter')

          // Circle
          g.append('circle')
            .attr('r', (d) => d.radius)
            .attr('fill', (d) => d.color)
            .attr('fill-opacity', 0.85)
            .attr('stroke', (d) => d.color)
            .attr('stroke-width', 2)
            .attr('stroke-opacity', 0.4)
            .style('filter', 'drop-shadow(0 4px 16px rgba(0,0,0,0.5))')

          // Answer text (hidden until reveal)
          g.append('text')
            .attr('class', 'answer-text')
            .attr('text-anchor', 'middle')
            .attr('dominant-baseline', 'middle')
            .attr('fill', revealed ? '#fff' : 'transparent')
            .attr('font-size', (d) => Math.max(12, d.radius / 3.5))
            .attr('font-weight', '700')
            .attr('dy', revealed ? '-0.5em' : '0')
            .text((d) => d.group.display)
            .style('filter', revealed ? 'none' : 'url(#blur-text)')

          // Count badge (only after reveal)
          if (revealed) {
            g.append('text')
              .attr('class', 'count-text')
              .attr('text-anchor', 'middle')
              .attr('dominant-baseline', 'middle')
              .attr('fill', 'rgba(255,255,255,0.7)')
              .attr('font-size', (d) => Math.max(10, d.radius / 5))
              .attr('font-weight', '400')
              .attr('dy', '0.9em')
              .text((d) => `×${d.group.count}`)
          }

          // Winner crown indicator
          if (revealed) {
            g.filter((d) => d.group.isWinner)
              .append('text')
              .attr('text-anchor', 'middle')
              .attr('dominant-baseline', 'auto')
              .attr('dy', (d) => -d.radius - 8)
              .attr('font-size', '20')
              .text('👑')
          }

          return g
        }
      )

    // Winner shimmer via stroke
    if (revealed) {
      nodeGroups
        .filter((d) => d.group.isWinner)
        .select('circle')
        .attr('stroke', 'gold')
        .attr('stroke-width', 4)
        .attr('stroke-opacity', 1)
        .attr('class', 'winner-shimmer')
    }

    // Tick
    sim.on('tick', () => {
      container
        .selectAll<SVGGElement, NodeDatum>('g.node')
        .attr('transform', (d) => {
          const x = Math.max(d.radius, Math.min(width - d.radius, d.x ?? width / 2))
          const y = Math.max(d.radius, Math.min(height - d.radius, d.y ?? height / 2))
          return `translate(${x},${y})`
        })
    })

    return () => {
      sim.stop()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groups.length, revealed, width, height])

  // Hot-update existing nodes when counts change (without rebuilding simulation)
  useEffect(() => {
    if (!simRef.current || !svgRef.current) return
    const svg = d3.select(svgRef.current)

    const nodes = buildNodes()

    // Merge new positions with existing ones
    nodes.forEach((newNode) => {
      const old = nodesRef.current.find((n) => n.id === newNode.id)
      if (old) {
        newNode.x = old.x
        newNode.y = old.y
        newNode.vx = old.vx
        newNode.vy = old.vy
      }
    })
    nodesRef.current = nodes

    simRef.current.nodes(nodes).alpha(0.3).restart()

    // Update radii + colours
    svg.selectAll<SVGCircleElement, NodeDatum>('g.node circle')
      .data(nodes, (d) => d.id)
      .attr('r', (d) => d.radius)
      .attr('fill', (d) => d.color)
      .attr('stroke', (d) => (revealed && d.group.isWinner ? 'gold' : d.color))

    // Update collide force
    simRef.current
      .force('collide', d3.forceCollide<NodeDatum>((d) => d.radius + 8).strength(0.9).iterations(4))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groups])

  return (
    <svg
      ref={svgRef}
      width={width}
      height={height}
      style={{ overflow: 'visible' }}
    />
  )
}
