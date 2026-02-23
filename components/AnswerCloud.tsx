'use client'

import { useEffect, useRef, useCallback } from 'react'
import * as d3 from 'd3'
import { AnswerGroup } from '@/lib/gameLogic'

const MIN_W = 90
const MAX_W = 240
const MIN_H = 44
const MAX_H = 110
const CHAR_W = 9
const PAD_X = 32

interface NodeDatum extends d3.SimulationNodeDatum {
  id: string
  group: AnswerGroup
  w: number
  h: number
  color: string
}

interface Props {
  groups: AnswerGroup[]
  revealed: boolean
  width: number
  height: number
}

const BASE_COLORS = [
  [210, 85],
  [160, 80],
  [280, 75],
  [340, 80],
  [35,  85],
  [145, 70],
  [195, 80],
]

function pickColor(index: number): string {
  const [h, s] = BASE_COLORS[index % BASE_COLORS.length]
  return `hsl(${h}, ${s}%, 52%)`
}

function blockDims(g: AnswerGroup, maxCount: number): { w: number; h: number } {
  const w = Math.min(MAX_W, Math.max(MIN_W, g.display.length * CHAR_W + PAD_X))
  const h = Math.min(MAX_H, MIN_H + (g.count / maxCount) * (MAX_H - MIN_H))
  return { w, h }
}

function collisionR(w: number, h: number) {
  return Math.sqrt((w / 2) ** 2 + (h / 2) ** 2) + 6
}

export default function AnswerCloud({ groups, revealed, width, height }: Props) {
  const svgRef    = useRef<SVGSVGElement>(null)
  const simRef    = useRef<d3.Simulation<NodeDatum, undefined> | null>(null)
  const nodesRef  = useRef<NodeDatum[]>([])
  const revealRef = useRef(revealed)
  revealRef.current = revealed

  const maxCount = Math.max(1, ...groups.map((g) => g.count))

  const buildNodes = useCallback((): NodeDatum[] => {
    return groups.map((g, i) => {
      const existing = nodesRef.current.find((n) => n.id === g.normalised)
      const { w, h } = blockDims(g, maxCount)
      return {
        id: g.normalised,
        group: g,
        w, h,
        color: pickColor(i),
        x: existing?.x ?? width  / 2 + (Math.random() - 0.5) * 120,
        y: existing?.y ?? height / 2 + (Math.random() - 0.5) * 120,
        vx: existing?.vx ?? 0,
        vy: existing?.vy ?? 0,
      }
    })
  }, [groups, maxCount, width, height])

  // Build physics simulation (not on reveal — that's handled separately)
  useEffect(() => {
    if (!svgRef.current) return

    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()

    const container = svg.append('g').attr('class', 'cloud-container')
    const nodes = buildNodes()
    nodesRef.current = nodes

    const sim = d3.forceSimulation<NodeDatum>(nodes)
      .force('center', d3.forceCenter(width / 2, height / 2).strength(0.08))
      .force('charge', d3.forceManyBody().strength(-15))
      .force('collide', d3.forceCollide<NodeDatum>((d) => collisionR(d.w, d.h)).strength(0.85).iterations(4))
      .force('x', d3.forceX(width  / 2).strength(0.04))
      .force('y', d3.forceY(height / 2).strength(0.04))
      .alphaDecay(0.02)

    simRef.current = sim

    const nodeGroups = container
      .selectAll<SVGGElement, NodeDatum>('g.node')
      .data(nodes, (d) => d.id)
      .join((enter) => {
        const g = enter.append('g').attr('class', 'node blob-enter')

        // Rounded rectangle
        g.append('rect')
          .attr('x', (d) => -d.w / 2)
          .attr('y', (d) => -d.h / 2)
          .attr('width',  (d) => d.w)
          .attr('height', (d) => d.h)
          .attr('rx', 16)
          .attr('fill', (d) => d.color)
          .attr('fill-opacity', 0.88)
          .style('filter', 'drop-shadow(0 4px 16px rgba(0,0,0,0.45))')

        // Placeholder "?" — always rendered, hidden on reveal
        g.append('text')
          .attr('class', 'placeholder')
          .attr('text-anchor', 'middle')
          .attr('dominant-baseline', 'middle')
          .attr('fill', 'rgba(255,255,255,0.35)')
          .attr('font-size', '18')
          .attr('font-weight', '700')
          .attr('opacity', revealRef.current ? 0 : 1)
          .text('?')

        // Answer text — always rendered, shown on reveal
        g.append('text')
          .attr('class', 'answer-label')
          .attr('text-anchor', 'middle')
          .attr('dominant-baseline', 'middle')
          .attr('fill', '#fff')
          .attr('font-size', '13')
          .attr('font-weight', '700')
          .attr('dy', (d) => d.h > 60 ? '-0.55em' : '0')
          .attr('opacity', revealRef.current ? 1 : 0)
          .text((d) => d.group.display)

        // Count badge — shown on reveal when block is tall enough
        g.append('text')
          .attr('class', 'count-label')
          .attr('text-anchor', 'middle')
          .attr('dominant-baseline', 'middle')
          .attr('fill', 'rgba(255,255,255,0.6)')
          .attr('font-size', '11')
          .attr('dy', '0.9em')
          .attr('opacity', 0)
          .text((d) => `x${d.group.count}`)

        return g
      })

    sim.on('tick', () => {
      nodeGroups.attr('transform', (d) => {
        const hw = d.w / 2
        const hh = d.h / 2
        const x = Math.max(hw, Math.min(width  - hw, d.x ?? width  / 2))
        const y = Math.max(hh, Math.min(height - hh, d.y ?? height / 2))
        return `translate(${x},${y})`
      })
    })

    return () => { sim.stop() }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groups.length, width, height])

  // Hot-update block sizes when counts change
  useEffect(() => {
    if (!simRef.current || !svgRef.current) return
    const svg = d3.select(svgRef.current)
    const nodes = buildNodes()

    nodes.forEach((n) => {
      const old = nodesRef.current.find((o) => o.id === n.id)
      if (old) { n.x = old.x; n.y = old.y; n.vx = old.vx; n.vy = old.vy }
    })
    nodesRef.current = nodes

    simRef.current.nodes(nodes).alpha(0.3).restart()
    simRef.current.force('collide', d3.forceCollide<NodeDatum>((d) => collisionR(d.w, d.h)).strength(0.85).iterations(4))

    svg.selectAll<SVGRectElement, NodeDatum>('g.node rect')
      .data(nodes, (d) => d.id)
      .attr('x', (d) => -d.w / 2)
      .attr('y', (d) => -d.h / 2)
      .attr('width',  (d) => d.w)
      .attr('height', (d) => d.h)

    // Update count text
    svg.selectAll<SVGTextElement, NodeDatum>('g.node text.count-label')
      .data(nodes, (d) => d.id)
      .text((d) => `x${d.group.count}`)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groups])

  // Reveal: fade out "?" and fade in answer text — blocks stay in place
  useEffect(() => {
    if (!svgRef.current) return
    const svg = d3.select(svgRef.current)

    if (revealed) {
      svg.selectAll<SVGTextElement, NodeDatum>('g.node text.placeholder')
        .transition().duration(300)
        .attr('opacity', 0)

      svg.selectAll<SVGTextElement, NodeDatum>('g.node text.answer-label')
        .transition().duration(400).delay(200)
        .attr('opacity', 1)

      svg.selectAll<SVGTextElement, NodeDatum>('g.node text.count-label')
        .filter(function() {
          const parent = this.closest('g.node')
          if (!parent) return false
          const rect = parent.querySelector('rect')
          if (!rect) return false
          return Number(rect.getAttribute('height') ?? 0) > 60
        })
        .transition().duration(400).delay(300)
        .attr('opacity', 1)
    }
  }, [revealed])

  return (
    <svg
      ref={svgRef}
      width={width}
      height={height}
      style={{ overflow: 'visible' }}
    />
  )
}
