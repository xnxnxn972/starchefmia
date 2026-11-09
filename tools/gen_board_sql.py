# Regenerate supabase/starchef-leaderboard.sql from the template + catalog:
#   python tools/gen_board_sql.py .
import json, sys

root = sys.argv[1]
d = json.load(open(f'{root}/src/data/chef-catalog.json', encoding='utf-8'))
rows = ",\n  ".join(f"('{x['id']}', '{x['course']}', {x['costCents']}, {x['ratingTenths']})" for x in d['dishes'])
template = open(f'{root}/supabase/starchef-leaderboard.template.sql', encoding='utf-8').read()
out = template.replace('/*DISH_ROWS*/', rows)
open(f'{root}/supabase/starchef-leaderboard.sql', 'w', encoding='utf-8').write(out)
print('written', len(out), 'chars;', len(d['dishes']), 'dishes')
