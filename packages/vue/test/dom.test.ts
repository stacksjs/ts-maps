/// <reference lib="dom" />

import { expect, test } from 'bun:test'

test('DOM environment is working', () => {
  document.body.innerHTML = `<button>My button</button>`
  const button = document.querySelector('button')
  expect(button?.textContent).toEqual('My button')
})

test('can create and manipulate DOM elements', () => {
  const container = document.createElement('div')
  container.id = 'map-container'
  container.style.width = '800px'
  container.style.height = '600px'
  container.style.position = 'relative'

  document.body.appendChild(container)

  expect(container).toBeDefined()
  expect(container.id).toBe('map-container')
  expect(container.style.width).toBe('800px')
  expect(container.style.height).toBe('600px')
  expect(container.style.position).toBe('relative')
})

test('can handle map container styling', () => {
  const mapDiv = document.createElement('div')
  mapDiv.setAttribute('data-testid', 'map-container')
  mapDiv.style.width = '100%'
  mapDiv.style.height = '400px'

  document.body.appendChild(mapDiv)

  expect(mapDiv.getAttribute('data-testid')).toBe('map-container')
  expect(mapDiv.style.width).toBe('100%')
  expect(mapDiv.style.height).toBe('400px')
})

test('can create loading state element', () => {
  const loadingDiv = document.createElement('div')
  loadingDiv.className = 'ts-maps-loading'
  loadingDiv.textContent = 'Loading map...'

  document.body.appendChild(loadingDiv)

  expect(loadingDiv.className).toBe('ts-maps-loading')
  expect(loadingDiv.textContent).toBe('Loading map...')
})
