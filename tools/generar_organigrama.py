"""Actualiza el contenido estático del organigrama desde assets/data/organigrama.json."""
import json
from html import escape as e
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
DEPARTMENT_SOURCE = 'https://jobs.tec.mx/tecnologico-de-monterrey/job/Tlalpan-Direcci%C3%B3n-de-Departamento-Regional-de-Mecatr%C3%B3nica/1441385600/'
PROGRAM_SOURCE = 'https://conecta.tec.mx/es/noticias/nacional/educacion/supiste-asi-cambio-el-modelo-de-acompanamiento-para-estudiantes-tec'


def person(p, kind='', priority=False):
    initials = ''.join(n[0] for n in p['name'].split()[:2])
    status = f'<span class="person-status">{e(p["status"])}</span>' if p.get('status') else ''
    id_attr = f' id="{e(p["id"])}"' if p.get('id') else ''
    classes = 'person ' + kind + (' is-priority' if priority else '')
    return f'''<a class="{classes}"{id_attr} href="mailto:{e(p['email'])}" aria-label="Enviar correo a {e(p['name'])}">
<span class="person-avatar" aria-hidden="true">{initials}</span>
<span><strong class="person-name">{e(p['name'])}</strong><span class="person-role">{e(p['role'])}</span>{status}<span class="person-email">{e(p['email'])}</span></span>
<span class="person-arrow" aria-hidden="true">↗</span></a>'''


def faculty():
    return ''.join(f'<li><div class="person org-faculty-node"><span><strong class="person-name">Profesorado de {name}</strong></span></div></li>' for name in ['tiempo completo', 'cátedra'])


def render(org):
    body = '''<main class="shell" id="contenido" tabindex="-1">
<header class="page-heading management-heading"><div class="page-intro"><p class="eyebrow">02 · Escuela de Ciencias Sociales y Gobierno</p><h1>Nuestra Escuela</h1><p>Conoce la estructura de la ECSG en la Región CDMX. Destacamos los contactos de referencia para el profesorado de Economía.</p></div><div class="chapter-mark" aria-hidden="true">02</div></header>
<nav class="section-links" aria-label="Ir a una parte del organigrama"><a href="#decanatura">Decanaturas y proyectos</a><a href="#departamentos">Departamentos</a><a href="#campus">División ECSG por campus</a><a href="#direccion-lec">Dirección Nacional de LEC</a></nav>
<aside class="org-role-guide" aria-label="Guía de funciones">
<div class="org-role-comparison"><p><strong>Dirección de departamento</strong>Atiende al profesorado: desarrollo docente y asignación académica.</p><p><strong>Dirección de programa</strong>Orienta al alumnado: trayectoria, UF y especialización.</p></div>
<details><summary>Qué hace cada puesto</summary><dl class="org-role-definitions">
<div><dt>Decanaturas</dt><dd>Lideran la Escuela en su ámbito nacional o regional.</dd></div>
<div><dt>Dirección divisional</dt><dd>Coordina la Escuela en su campus.</dd></div>
<div><dt>Proyectos académicos</dt><dd>Articulan las iniciativas académicas de la región.</dd></div>
<div><dt>Coordinación académica</dt><dd>Apoya la operación académica del departamento.</dd></div>
<div><dt>Dirección de entrada</dt><dd>Guía al alumnado durante la etapa de exploración.</dd></div>
<div><dt>Dirección Nacional de LEC</dt><dd>Articula el programa de Economía a nivel nacional.</dd></div>
</dl>'''
    body += f'<p class="org-role-sources">Guía orientativa. Referencias del Tec: <a href="{DEPARTMENT_SOURCE}" target="_blank" rel="noopener">funciones de departamento</a> y <a href="{PROGRAM_SOURCE}" target="_blank" rel="noopener">acompañamiento de entrada y programa</a>.</p></details></aside>'
    body += '<section id="decanatura" aria-labelledby="decanatura-title"><div class="section-title"><h2 id="decanatura-title">Decanaturas y proyectos académicos</h2></div><div class="org-top">'
    body += person(org['national'], 'org-national', True) + '<div class="org-connector" aria-hidden="true"></div>'
    body += person(org['regional'], 'org-regional', True) + '<div class="org-connector" aria-hidden="true"></div><div class="org-projects">'
    body += ''.join(person(p) for p in org['projects']) + '</div></div></section>'
    economy = next(d for d in org['departments'] if d['area'] == 'Economía')
    body += '<section id="departamentos" aria-labelledby="departamentos-title"><div class="section-title"><h2 id="departamentos-title">Departamentos regionales</h2><p>Dependientes de la Decanatura Regional</p></div>'
    body += '<div class="org-economics"><h3>Departamento de Economía</h3><div class="org-economics-head">' + person(economy['head'], 'org-department', True) + '</div>'
    body += '<div class="org-economics-grid">'
    for head, coordinator in zip(economy['campusHeads'], economy['coordinators'], strict=True):
        body += f'<div class="org-column"><h4>{head["campus"]}</h4>' + person(head, 'org-department', True)
        body += '<ul class="org-children org-campus-team">' + faculty() + '<li>' + person(coordinator, 'org-coordination') + '</li></ul></div>'
    body += '</div></div><h3 class="org-other-title">Otros departamentos regionales</h3><div class="org-other-departments">'
    for dept in org['departments']:
        if dept['area'] == 'Economía':
            continue
        body += f'<div class="org-column"><h4>{e(dept["area"])}</h4>' + person(dept['head'], 'org-department')
        body += '<ul class="org-children org-other-faculty">' + faculty() + '</ul></div>'
    body += '</div></section><section id="campus" aria-labelledby="campus-title"><div class="section-title"><h2 id="campus-title">División ECSG por campus</h2><p>Dependientes de la Decanatura Regional</p></div><div class="org-columns">'
    for campus in org['campuses']:
        body += f'<div class="org-column"><h3>{campus["code"]}<small>Campus {campus["name"]}</small></h3>' + person(campus['head'], 'org-division', True)
        body += '<ul class="org-children">'
        for p in sorted(campus['team'], key=lambda p: not bool(p.get('id'))):
            body += '<li>' + person(p, priority=bool(p.get('id'))) + '</li>'
        body += '</ul></div>'
    body += '</div></section><section id="direccion-lec" aria-labelledby="lec-title"><div class="section-title"><h2 id="lec-title">Dirección Nacional de LEC</h2></div><div class="org-lec">' + person(org['lec']) + '<div><p>Vinculada con las direcciones del programa de Economía de los tres campus.</p><div class="org-lec-links">'
    for campus in org['campuses']:
        p = next(p for p in campus['team'] if p.get('id'))
        body += f'<a href="#{p["id"]}">{campus["code"]} · {e(p["name"])}</a>'
    body += '</div></div></div></section><p class="source-note">Estructura y contactos del organigrama, con las precisiones de la coordinación del 19 de noviembre de 2026. Las notas de licencia e interinato se conservan de la fuente. Selecciona una persona para abrir su correo.</p></main>'
    return body.replace('><', '>\n<')


def main():
    org = json.loads((ROOT / 'assets/data/organigrama.json').read_text(encoding='utf-8'))
    path = ROOT / 'organigrama.html'
    text = path.read_text(encoding='utf-8')
    text, count = re.subn(r'<main\b.*?</main>', lambda _: render(org), text, count=1, flags=re.S)
    if count != 1:
        raise ValueError('No se encontró el contenedor principal del organigrama')
    text = re.sub(r'assets/css/gestion.css\?v=\d+', 'assets/css/gestion.css?v=3', text)
    path.write_text(text, encoding='utf-8')
    print('Organigrama actualizado desde el archivo de datos.')


if __name__ == '__main__':
    main()
