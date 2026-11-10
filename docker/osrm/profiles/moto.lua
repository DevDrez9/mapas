-- Perfil de MOTOCICLETA para OSRM.
--
-- OSRM no trae un perfil de moto, así que este reutiliza el perfil de auto
-- (/opt/car.lua, incluido en la imagen oficial) y cambia solo lo que es distinto
-- para una moto:
--   * Respeta las etiquetas de acceso "motorcycle=*" de OpenStreetMap.
--   * Usa las dimensiones de una moto: puede pasar por calles con maxwidth,
--     maxheight o maxweight que bloquean a un auto.
--   * Velocidades algo mayores en vías urbanas (ver SPEED_FACTOR).
--   * Permite caminos de tierra (highway=track), comunes en zonas rurales.
--
-- IMPORTANTE: si cambias algo en este archivo, el mapa de motos debe procesarse de
-- nuevo. En el servidor:
--   docker compose build osrm-moto
--   docker compose run --rm --entrypoint rm osrm-moto -f /data/moto/.ready
--   docker compose up -d osrm-moto

api_version = 4

local Sequence = require('lib/sequence')
local car = require('car')

-- Multiplicador de velocidad respecto al auto, por tipo de vía (1.0 = igual que auto).
-- OSRM no conoce el tráfico: estas cifras son una estimación inicial.
-- Calíbralas comparando con tiempos reales de tus repartos.
local SPEED_FACTOR = {
  motorway       = 1.0,
  motorway_link  = 1.0,
  trunk          = 1.0,
  trunk_link     = 1.0,
  primary        = 1.05,
  primary_link   = 1.05,
  secondary      = 1.1,
  secondary_link = 1.1,
  tertiary       = 1.15,
  tertiary_link  = 1.15,
  unclassified   = 1.15,
  residential    = 1.15,
  living_street  = 1.2,
  service        = 1.2,
}

-- Vías que el perfil de auto no usa pero una moto sí (velocidad en km/h).
local EXTRA_SPEEDS = {
  track = 15,
}

local function setup()
  local profile = car.setup()

  -- Dimensiones de una moto (metros / kilogramos).
  profile.vehicle_height = 1.5
  profile.vehicle_width = 1.0
  profile.vehicle_length = 2.2
  profile.vehicle_weight = 250

  -- Etiquetas de acceso y de restricciones de giro propias de motos.
  profile.access_tags_hierarchy = Sequence { 'motorcycle', 'motor_vehicle', 'vehicle', 'access' }
  profile.restrictions = Sequence { 'motorcycle', 'motor_vehicle', 'vehicle' }

  local highway_speeds = profile.speeds.highway

  for highway, factor in pairs(SPEED_FACTOR) do
    local speed = highway_speeds[highway]
    if speed ~= nil then
      highway_speeds[highway] = speed * factor
    end
  end

  for highway, speed in pairs(EXTRA_SPEEDS) do
    if highway_speeds[highway] == nil then
      highway_speeds[highway] = speed
    end
  end

  return profile
end

return {
  setup = setup,
  process_way = car.process_way,
  process_node = car.process_node,
  process_turn = car.process_turn,
}
