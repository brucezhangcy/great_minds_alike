'use client'

import { useEffect, useRef } from 'react'
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

/** Safe translate — falls back to center if x/y is somehow NaN/undefined */
function safeTranslate(
  d: NodeDatum,
  width: number,
  height: number,
): string {
  const cx = width  / 2
  const cy = height / 2
  const hw = d.w / 2
  const hh = d.h / 2
  const rx = isFinite(d.x!) ? d.x! : cx
  const ry = isFinite(d.y!) ? d.y! : cy
  const x  = Math.max(hw, Math.min(width  - hw, rx))
  const y  = Math.max(hh, Math.min(height - hh, ry))
  return `translate(${x},${y})`
}

export default function AnswerCloud({ groups, revealed, width, height }: Props) {
  const svgRef    = useRef<SVGSVGElement>(null)
  const nodesRef  = useRef<NodeDatum[]>([])
  const revealRef = useRef(revealed)
  revealRef.current = revealed

  useEffect(() => {
    if (!svgRef.current || width <= 0 || height <= 0) return

    const svg      = d3.select(svgRef.current)
    const prevNodes = nodesRef.current
    const cx = width  / 2
    const cy = height / 2

    // Always start fresh — position preservation keeps blocks from jumping
    svg.selectAll('*').remove()

    if (groups.length === 0) {
      nodesRef.current = []
      return
    }

    const maxCount = Math.max(1, ...groups.map(g => g.count))

    // Build node array with GUARANTEED finite positions
    const nodes: NodeDatum[] = groups.map((g, i) => {
      const existing = prevNodes.find(n => n.id === g.normalised)
      const { w, h } = blockDims(g, maxCount)
      const ex = existing?.x
      const ey = existing?.y
      return {
        id: g.normalised,
        group: g,
        w, h,
        color: pickColor(i),
        // Only reuse if the previous value was finite
        x: (ex != null && isFinite(ex)) ? ex : cx + (Math.random() - 0.5) * 80,
        y: (ey != null && isFinite(ey)) ? ey : cy + (Math.random() - 0.5) * 80,
        vx: 0,
        vy: 0,
      }
    })
    nodesRef.current = nodes

    // Build DOM — apply correct transforms immediately so blocks never sit at (0,0)
    const container = svg.append('g')
    container
      .selectAll<SVGGElement, NodeDatum>('g.node')
      .data(nodes, d => d.id)
      .join(enter => {
        const g = enter.append('g').attr('class', 'node')
          .attr('transform', d => safeTranslate(d, width, height))

        g.append('rect')
          .attr('x', d => -d.w / 2).attr('y', d => -d.h / 2)
          .attr('width', d => d.w).attr('height', d => d.h)
          .attr('rx', 16).attr('fill', d => d.color).attr('fill-opacity', 0.88)
          .style('filter', 'drop-shadow(0 4px 16px rgba(0,0,0,0.45))')

        g.append('text').attr('class', 'placeholder')
          .attr('text-anchor', 'middle').attr('dominant-baseline', 'middle')
          .attr('fill', 'rgba(255,255,255,0.35)')
          .attr('font-size', '18').attr('font-weight', '700')
          .attr('opacity', revealRef.current ? 0 : 1)
          .text('?')

        g.append('text').attr('class', 'answer-label')
          .attr('text-anchor', 'middle').attr('dominant-baseline', 'middle')
          .attr('fill', '#fff').attr('font-size', '13').attr('font-weight', '700')
          .attr('dy', d => d.h > 60 ? '-0.55em' : '0')
          .attr('opacity', revealRef.current ? 1 : 0)
          .text(d => d.group.display)

        g.append('text').attr('class', 'count-label')
          .attr('text-anchor', 'middle').attr('dominant-baseline', 'middle')
          .attr('fill', 'rgba(255,255,255,0.6)').attr('font-size', '11')
          .attr('dy', '0.9em').attr('opacity', 0)
          .text(d => `x${d.group.count}`)

        return g
      })

    // Physics — stopped immediately; we drive ticks manually via RAF below
    const sim = d3.forceSimulation<NodeDatum>(nodes)
      .force('center', d3.forceCenter(cx, cy).strength(0.15))
      .force('charge',  d3.forceManyBody().strength(-25))
      .force('collide', d3.forceCollide<NodeDatum>(d => collisionR(d.w, d.h)).strength(0.9).iterations(5))
      .force('x', d3.forceX(cx).strength(0.1))
      .force('y', d3.forceY(cy).strength(0.1))
      .alphaDecay(0.02)
      .stop() // disable D3's own requestAnimationFrame loop

    // Start at lower alpha when reusing positions so blocks don't scatter
    if (prevNodes.length > 0) sim.alpha(0.4)

    // Manual RAF loop — immune to React StrictMode double-invocation because
    // we cancel via the `active` flag before the second invocation starts.
    let rafId: number
    let active = true

    const tick = () => {
      if (!active || !svgRef.current) return
      sim.tick()
      d3.select(svgRef.current)
        .selectAll<SVGGElement, NodeDatum>('g.node')
        .attr('transform', d => safeTranslate(d, width, height))
      if (sim.alpha() > sim.alphaMin()) {
        rafId = requestAnimationFrame(tick)
      }
    }

    rafId = requestAnimationFrame(tick)

    return () => {
      active = false
      cancelAnimationFrame(rafId)
    }
  }, [groups, width, height])

  // Reveal: block fades out, answer word appears in the block's own color
  useEffect(() => {
    if (!svgRef.current || !revealed) return
    const svg = d3.select(svgRef.current)

    // "?" disappears quickly
    svg.selectAll('g.node text.placeholder')
      .transition().duration(200)
      .attr('opacity', 0)

    // Colored block fades away
    svg.selectAll('g.node rect')
      .transition().duration(500).delay(100)
      .attr('fill-opacity', 0)

    // Answer label: switch to the block's color, re-center, then fade in
    svg.selectAll<SVGTextElement, NodeDatum>('g.node text.answer-label')
      .attr('fill', d => d.color)
      .attr('font-size', '15')
      .attr('dy', '0')           // center vertically now that there's no count badge
      .attr('font-weight', '800')
      .transition().duration(500).delay(300)
      .attr('opacity', 1)
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
