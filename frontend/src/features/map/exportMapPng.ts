import type { MapSnapshot } from './MapCanvas'

export async function downloadMapPng(snapshot: Extract<MapSnapshot, { image: string }>) {
  const image = new Image()
  image.src = snapshot.image
  await image.decode()
  const ratio = image.naturalWidth / snapshot.widthCss
  const mapHeight = image.naturalHeight / ratio
  const canvas = document.createElement('canvas')
  canvas.width = image.naturalWidth
  canvas.height = Math.ceil(image.naturalHeight + 146 * ratio)
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Prohlížeč neumí vytvořit obrázek mapy.')
  context.scale(ratio, ratio)
  context.drawImage(image, 0, 0, snapshot.widthCss, mapHeight)

  const boxX = snapshot.widthCss - 54
  context.fillStyle = '#fffffff2'; context.fillRect(boxX, 12, 42, 48)
  context.fillStyle = '#173b34'; context.textAlign = 'center'; context.font = '700 25px sans-serif'
  context.save(); context.translate(boxX + 21, 38); context.rotate(-snapshot.bearing * Math.PI / 180)
  context.fillText('↑', 0, 0); context.restore()
  context.font = '700 11px sans-serif'; context.fillText('S', boxX + 21, 52)

  context.fillStyle = '#fffffff2'; context.fillRect(12, mapHeight - 42, 126, 30)
  context.strokeStyle = '#173b34'; context.lineWidth = 2
  context.beginPath(); context.moveTo(20, mapHeight - 19); context.lineTo(120, mapHeight - 19)
  context.moveTo(20, mapHeight - 26); context.lineTo(20, mapHeight - 19)
  context.moveTo(120, mapHeight - 26); context.lineTo(120, mapHeight - 19); context.stroke()
  context.textAlign = 'center'; context.fillStyle = '#173b34'; context.font = '700 11px sans-serif'
  context.fillText(`${Math.round(snapshot.scaleMeters)} m`, 70, mapHeight - 27)

  context.fillStyle = '#fff'; context.fillRect(0, mapHeight, snapshot.widthCss, 146)
  context.fillStyle = '#173b34'; context.textAlign = 'left'; context.font = '700 17px sans-serif'
  context.fillText('Mapa optické sítě', 18, mapHeight + 25)
  context.fillStyle = '#5f756b'; context.font = '12px sans-serif'
  context.fillText(`${snapshot.baseMap}${snapshot.cadastre ? ' + katastr' : ''} · ${snapshot.center} · ${snapshot.capturedAt}`,
    18, mapHeight + 46, snapshot.widthCss - 36)
  const legend = [
    { label: 'Budova', color: '#24796d', line: false }, { label: 'Šachta', color: '#b8613e', line: false },
    { label: 'Trasa bez osazení', color: '#b8613e', line: true },
    { label: 'Chránička', color: '#26766b', line: true }, { label: 'Optický kabel', color: '#2d6f9f', line: true },
  ]
  let x = 18
  let legendY = mapHeight + 65
  context.font = '11px sans-serif'; context.fillStyle = '#24453d'
  for (const item of legend) {
    const needed = context.measureText(item.label).width + (item.line ? 46 : 41)
    if (x + needed > snapshot.widthCss - 18 && x > 18) { x = 18; legendY += 18 }
    context.fillStyle = item.color
    if (item.line) context.fillRect(x, legendY, 20, 4)
    else { context.beginPath(); context.arc(x + 8, legendY + 2, 7, 0, Math.PI * 2); context.fill() }
    x += item.line ? 26 : 21
    context.fillStyle = '#24453d'; context.fillText(item.label, x, legendY + 5)
    x += context.measureText(item.label).width + 20
  }
  context.fillStyle = '#5f756b'; context.font = '10px sans-serif'
  context.fillText(snapshot.baseMap === 'Uliční mapa' ? 'Podklad: OpenFreeMap © OpenMapTiles Data from OpenStreetMap'
    : 'Podklad: © ČÚZK – Ortofoto ČR', 18, mapHeight + 104, snapshot.widthCss - 36)
  if (snapshot.cadastre) context.fillText('Katastr: ČÚZK', 18, mapHeight + 119)
  context.fillText('Orientační měřítko. Výstup není projektovou dokumentací.', 18, mapHeight + 135)

  const link = document.createElement('a')
  link.href = canvas.toDataURL('image/png')
  link.download = `mapa-site-${new Date().toISOString().slice(0, 10)}.png`
  link.click()
}
