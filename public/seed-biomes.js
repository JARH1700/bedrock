export const biomeLabels = {
  0: 'Océano', 1: 'Llanura', 2: 'Desierto', 3: 'Colinas ventosas', 4: 'Bosque', 5: 'Taiga', 6: 'Pantano', 7: 'Río',
  8: 'Yermos del Nether', 9: 'El End', 10: 'Océano congelado', 11: 'Río congelado', 12: 'Llanura nevada', 14: 'Isla de hongos',
  16: 'Playa', 21: 'Jungla', 23: 'Jungla dispersa', 24: 'Océano profundo', 25: 'Costa rocosa', 26: 'Playa nevada', 27: 'Abedular',
  29: 'Bosque oscuro', 30: 'Taiga nevada', 32: 'Taiga de pinos antiguos', 34: 'Bosque ventoso', 35: 'Sabana', 36: 'Meseta de sabana',
  37: 'Badlands', 38: 'Badlands arboladas', 40: 'Islas pequeñas del End', 41: 'Tierras medias del End', 42: 'Tierras altas del End', 43: 'Baldíos del End',
  44: 'Océano cálido', 45: 'Océano templado', 46: 'Océano frío', 47: 'Océano cálido profundo', 48: 'Océano templado profundo', 49: 'Océano frío profundo', 50: 'Océano congelado profundo',
  129: 'Llanura de girasoles', 131: 'Colinas de grava ventosas', 132: 'Bosque de flores', 140: 'Picos de hielo',
  155: 'Abedular antiguo', 160: 'Taiga de abetos antiguos', 163: 'Sabana ventosa', 165: 'Badlands erosionadas',
  168: 'Jungla de bambú', 170: 'Valle de almas', 171: 'Bosque carmesí', 172: 'Bosque distorsionado', 173: 'Deltas de basalto',
  174: 'Cuevas de espeleotemas', 175: 'Cuevas frondosas', 177: 'Pradera', 178: 'Arboleda', 179: 'Laderas nevadas', 180: 'Picos escarpados',
  181: 'Picos helados', 182: 'Picos pedregosos', 183: 'Oscuridad profunda', 184: 'Manglar', 185: 'Cerezal', 186: 'Jardín pálido',
};
export const biomeLabel = biome => biomeLabels[biome?.id] || biome?.name?.replaceAll('_', ' ') || 'Desconocido';
