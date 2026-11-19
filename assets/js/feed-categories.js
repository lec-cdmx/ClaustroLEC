export const categories = [
  { id: 'community', label: 'Comunidad', description: 'Reconocimientos y logros de profesores y estudiantes.' },
  { id: 'agenda', label: 'Agenda', description: 'Eventos, seminarios e invitaciones.' },
  { id: 'discussion', label: 'Discusión', description: 'Preguntas e ideas para conversar sobre economía.' },
  { id: 'practice', label: 'Buenas prácticas', description: 'Experiencias y recursos que funcionan en el aula.' },
];
export const categoryLabel = id => categories.find(category => category.id === id)?.label || 'Buenas prácticas';
