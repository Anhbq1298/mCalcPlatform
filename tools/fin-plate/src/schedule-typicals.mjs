import { grid } from './bolt-group.mjs';
import { family, geometry } from './schedule.mjs';
import { typical } from './typical.mjs';

const svgNamespace = 'http://www.w3.org/2000/svg';

export function scheduleTypicals(host, criteria, result, sections, symbolic) {
  host.replaceChildren();
  const prefer = sections.find(s => criteria.families.includes(family(s)) && !criteria.excluded.includes(s.id));
  for (const columns of [1, 2]) {
    const article = document.createElement('article');
    const title = document.createElement('h3');
    title.textContent = columns === 1 ? 'Single bolt column (S)' : 'Double bolt column (D)';
    article.append(title);
    const marks = result.details.filter(detail => detail.nc === columns);
    const select = document.createElement('select');
    select.setAttribute('aria-label', title.textContent + ' marking');
    for (const g of marks) select.add(new Option(g.mark, g.mark));
    const status = document.createElement('p');
    if (marks.length) article.append(select);
    article.append(status);
    const elevation = document.createElementNS(svgNamespace, 'svg');
    const plan = document.createElementNS(svgNamespace, 'svg');
    const planDetails = document.createElement('details');
    const summary = document.createElement('summary');
    summary.textContent = 'Plan';
    planDetails.append(summary, plan);
    article.append(elevation, planDetails);
    for (const [view, svg] of [['elevation', elevation], ['plan', plan]]) {
      svg.setAttribute('role', 'img');
      svg.setAttribute('aria-label', title.textContent + ' ' + view);
      const button = document.createElement('button');
      button.textContent = 'Export ' + view + ' SVG';
      button.onclick = () => {
        const link = document.createElement('a');
        link.download = (select.value || 'schematic-' + columns) + '-' + view + '.svg';
        link.href = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(svg)], {type:'image/svg+xml'}));
        link.click();
        setTimeout(() => URL.revokeObjectURL(link.href), 1000);
      };
      article.append(button);
    }
    function render() {
      const cell = result.cells.find(x => x.mark && x.mark === select.value);
      const g = cell?.choice.g ?? geometry(criteria, criteria.minRows, columns);
      const beam = cell?.choice.profiles.find(s => s.name === cell.choice.worst.profile) ?? prefer;
      status.textContent = cell ? beam.name : 'Schematic geometry · no marking selected in this schedule';
      if (!beam) return;
      const bolts = grid({columns, rows:g.nr, pitch:criteria.pitch, gauge:criteria.gauge,
        gap:criteria.gap, beamEnd:criteria.beamEnd, bottom:criteria.end});
      for (const [view, svg] of [[false, elevation], [true, plan]]) {
        typical(svg, criteria, g, beam.values, {group:{bolts}}, view, symbolic);
        if (!cell) {
          const title = document.createElementNS(svgNamespace, 'title');
          title.textContent = 'Schematic geometry, no marking selected';
          svg.prepend(title);
          const [x,y,width]=svg.getAttribute('viewBox').split(' ').map(Number);
          const note=document.createElementNS(svgNamespace,'text');
          note.setAttribute('x',x+width/2);
          note.setAttribute('y',y+14);
          note.setAttribute('text-anchor','middle');
          note.setAttribute('font-size','10');
          note.setAttribute('fill','#172633');
          note.setAttribute('stroke','none');
          note.textContent='Schematic · no schedule marking';
          svg.append(note);
        }
      }
    }
    select.onchange = render;
    render();
    host.append(article);
  }
}
