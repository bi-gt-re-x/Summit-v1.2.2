/**
 * Geography, a branch of Humanities.
 *
 * Physical and human geography together, ending where AP Human Geography does.
 */
import type { SubjectTree } from './types';
import { open, lock } from './types';

export const GEOGRAPHY: SubjectTree = {
  id: 'geography',
  title: 'Geography',
  blurb: 'Places, people and how they shape each other.',
  parent: 'humanities',
  nodes: [
    { id: 'gg.maps', name: 'Maps & Projections', icon: 'map', tier: 'foundation', core: true, state: open, percent: 0, xp: 1100,
      desc: "Latitude, longitude and why every flat map stretches something. Greenland isn't really the size of Africa." },
    { id: 'gg.places', name: 'Countries & Capitals', icon: 'globe', tier: 'foundation', requires: ['gg.maps'], state: lock, percent: 0, xp: 1200,
      desc: 'Knowing where places are. It makes every news story and history lesson easier to follow.' },
    { id: 'gg.physical', name: 'Landforms & Water', icon: 'landscape', tier: 'beginner', core: true, requires: ['gg.maps'], state: lock, percent: 0, xp: 1600,
      desc: 'Mountains, rivers, plains and coasts. Rivers decided where most old cities got built.' },
    { id: 'gg.climate', name: 'Climate Zones', icon: 'climate', tier: 'beginner', requires: ['gg.physical'], state: lock, percent: 0, xp: 1700,
      desc: 'Why some places are hot, cold, wet or dry. Latitude, ocean currents and mountains explain most of it.' },
    { id: 'gg.population', name: 'Population', icon: 'population', tier: 'beginner', core: true, requires: ['gg.places'], state: lock, percent: 0, xp: 1400,
      desc: 'Where people live, how fast populations grow and population pyramids. The demographic transition model is a test favorite.' },
    { id: 'gg.migration', name: 'Migration', icon: 'path-route', tier: 'intermediate', requires: ['gg.population'], state: lock, percent: 0, xp: 1800,
      desc: 'Why people move, with push and pull factors. Most migrants move within their own country.' },
    { id: 'gg.culture', name: 'Culture & Language', icon: 'culture', tier: 'intermediate', requires: ['gg.places'], state: lock, percent: 0, xp: 1900,
      desc: 'How languages, religions and customs spread. Ideas travel along trade routes just like goods do.' },
    { id: 'gg.urban', name: 'Cities', icon: 'street', tier: 'intermediate', requires: ['gg.migration'], state: lock, percent: 0, xp: 2000,
      desc: 'How cities grow, their layouts and urban sprawl. Over half the world now lives in cities.' },
    { id: 'gg.agriculture', name: 'Agriculture & Land Use', icon: 'vegetable', tier: 'intermediate', requires: ['gg.climate', 'gg.population'], state: lock, percent: 0, xp: 1700,
      desc: 'Farming types, the Green Revolution and where food comes from. Climate and money both decide what grows where.' },
    { id: 'gg.political', name: 'Political Geography', icon: 'politics', tier: 'advanced', requires: ['gg.culture'], state: lock, percent: 0, xp: 2100,
      desc: 'Borders, states, nations and conflicts over territory. Many borders were drawn by people who never visited.' },
    { id: 'gg.economic', name: 'Economic Development', icon: 'econ-lens', tier: 'advanced', requires: ['gg.urban', 'gg.agriculture'], state: lock, percent: 0, xp: 2200,
      desc: 'Why some countries are richer than others, and how that changes. Measure development with more than one number.' },
    { id: 'gg.globalization', name: 'Globalization', icon: 'network', tier: 'advanced', requires: ['gg.economic'], state: lock, percent: 0, xp: 2300,
      desc: 'Trade, supply chains and connected cultures. Your phone has parts from dozens of countries.' },
    { id: 'gg.environment', name: 'People & Environment', icon: 'earth-system', tier: 'expert', requires: ['gg.globalization', 'gg.climate'], state: lock, percent: 0, xp: 2300,
      desc: 'How people change the land and how the land limits people. Deforestation and dams are classic case studies.' },
    { id: 'gg.gis', name: 'GIS & Data Maps', icon: 'layers', tier: 'expert', requires: ['gg.maps', 'gg.economic'], state: lock, percent: 0, xp: 2400,
      desc: 'Making maps from data with layers. GIS is used everywhere from city planning to disaster response.' },
    { id: 'gg.aphg', name: 'AP Human Geography', icon: 'exam', tier: 'mastery', requires: ['gg.environment', 'gg.gis', 'gg.political'], state: lock, percent: 0, xp: 2800,
      desc: 'Models, vocabulary and free-response practice. Learn each model, then learn where it breaks down.' },
  ],
};
