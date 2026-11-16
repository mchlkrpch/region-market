#!/usr/bin/env python3
"""Serve the local annual cryptocurrency explorer. Python standard library only."""
import argparse
from array import array
from concurrent.futures import ThreadPoolExecutor
import csv
from functools import lru_cache
import gzip
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import json
import math
from pathlib import Path
from urllib.parse import urlsplit, parse_qs
import news_data
import event_study

HERE = Path(__file__).resolve().parent
DATA = HERE.parent.parent / 'regional_crypto_15m'
START, END, BASE = 1751328000, 1782864000, 900
SLOTS = (END - START) // BASE
REGIONS = {'US': 'США', 'EU': 'Еврозона', 'ID': 'Индонезия', 'TH': 'Таиланд', 'KR': 'Южная Корея', 'HK': 'Гонконг', 'AE': 'ОАЭ'}
SERIES = json.loads((DATA / 'news_ab_2025_07_2026_06/price_series.json').read_text())
INDEX = {s['id']: s for s in SERIES}
POOL = ThreadPoolExecutor(max_workers=6)


@lru_cache(maxsize=1)
def market_sets():
    definitions=[('four_markets_90','США / Еврозона / Индонезия / Таиланд'),('cn_hk_26','Китай / Гонконг'),('us_ae_25','США / ОАЭ'),('us_kr_92','США / Южная Корея')]
    setups={}
    for filename in ['semester_universe.json','us_kr_universe.json']:
        setups.update(json.loads((DATA/filename).read_text())['setups'])
    regional={region:{item['asset'] for item in SERIES if item['region']==region} for region in REGIONS}
    result=[]
    for key,label in definitions:
        setup=setups[key];regions=setup['regions'];available=set.intersection(*(regional[r] for r in regions))
        result.append(dict(id=key,label=label,regions=regions,plannedCount=len(setup['assets']),availableCount=len(available),
                           availableAssets=sorted(available),note=setup.get('note','')))
    return result


def source_paths(item):
    return [DATA / item['root'] / 'series' / item['venue'] / item['asset'] / (half + '.csv') for half in ['2025H2', '2026H1']]


@lru_cache(maxsize=32)
def load_prices(identifier, versions):
    columns = [array('d', [math.nan]) * SLOTS for _ in range(5)]
    offset = 0
    for path in source_paths(INDEX[identifier]):
        with path.open(newline='', encoding='utf-8-sig') as handle:
            for row in csv.DictReader(handle):
                if offset >= SLOTS:
                    raise ValueError('Слишком много строк в ' + str(path))
                if row['status'] == 'traded' and float(row['volume_base'] or 0) > 0:
                    values = [float(row[key]) for key in ['open', 'high', 'low', 'close']]
                    if all(math.isfinite(value) and value > 0 for value in values):
                        for column, value in zip(columns, values):
                            column[offset] = value
                        columns[4][offset] = float(row['volume_base'])
                offset += 1
    if offset != SLOTS:
        raise ValueError('Неполная временная сетка ' + identifier)
    return columns


@lru_cache(maxsize=32)
def study_prices(identifier, versions):
    return event_study.PriceWindows(load_prices(identifier, versions), START, END)


def aggregate(request):
    identifier, start, end, step, candles = request
    item = INDEX[identifier]
    paths = source_paths(item)
    prices = load_prices(identifier, tuple(p.stat().st_mtime_ns for p in paths))
    width = step // BASE
    bars = []
    valid = 0
    for timestamp in range(start, end, step):
        position = (timestamp - START) // BASE
        closes = prices[3][position:position + width]
        if len(closes) != width or any(not math.isfinite(x) for x in closes):
            bars.append(None)
            continue
        valid += 1
        if candles:
            bars.append([prices[0][position], max(prices[1][position:position + width]),
                         min(prices[2][position:position + width]), closes[-1]])
        else:
            bars.append(closes[-1])
    return dict(id=identifier, asset=item['asset'], region=item['region'], quote=item['quote'],
                exchange=item['exchange'], pair=item['pair'], bars=bars, valid=valid)


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(HERE), **kwargs)

    def send_json(self, value, status=200):
        body = json.dumps(value, ensure_ascii=False, allow_nan=False, separators=(',', ':')).encode()
        compressed = 'gzip' in self.headers.get('Accept-Encoding', '') and len(body) > 1024
        if compressed:
            body = gzip.compress(body, compresslevel=3)
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Cache-Control', 'no-store')
        if compressed:
            self.send_header('Content-Encoding', 'gzip')
            self.send_header('Vary', 'Accept-Encoding')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        try:
            self.wfile.write(body)
        except (BrokenPipeError, ConnectionResetError):
            pass

    def do_GET(self):
        route = urlsplit(self.path).path
        if route == '/api/catalog':
            assets = {}
            for item in SERIES:
                assets.setdefault(item['asset'], dict(symbol=item['asset'], group=item['group'],
                    groupLabel=item.get('group_label', item['group']), regions=[]))['regions'].append(item['region'])
            self.send_json(dict(start=START, end=END, regions=REGIONS, assets=list(assets.values()),marketSets=market_sets(),
                series=[{k: s[k] for k in ['id', 'asset', 'region', 'quote', 'exchange', 'pair']} for s in SERIES]))
        elif route == '/api/news-detail':
            try:
                identifier=parse_qs(urlsplit(self.path).query).get('id',[''])[0]
                self.send_json(news_data.detail(DATA,identifier))
            except ValueError as error:
                self.send_json({'error':str(error)},404)
        elif route == '/api/news':
            self.send_json(dict(events=news_data.catalog(DATA),families=news_data.LABELS))
        elif route == '/api/event-study/catalog':
            self.send_json(event_study.semantic_catalog(DATA))
        elif route.startswith('/api/'):
            self.send_json({'error': 'Неизвестный запрос'}, 404)
        else:
            # Serve application assets only. Local datasets stay behind the catalog API.
            if route not in ['/', '/index.html', '/app.js', '/grid.js', '/plot.js', '/news.js', '/study.js', '/date_input.js', '/styles.css', '/favicon.ico']:
                self.send_error(404)
                return
            super().do_GET()

    def do_POST(self):
        route=urlsplit(self.path).path
        if route not in ['/api/series','/api/news-stats','/api/event-study']:
            self.send_json({'error': 'Неизвестный запрос'}, 404)
            return
        try:
            length = int(self.headers.get('Content-Length', 0))
            if not 0 < length <= 200000:
                raise ValueError('Некорректный размер запроса')
            payload = json.loads(self.rfile.read(length))
            ids = list(dict.fromkeys(payload['ids']))
            if any(identifier not in INDEX for identifier in ids):
                raise ValueError('Неизвестная торговая пара')
            if route == '/api/event-study':
                payload['ids']=ids
                def columns(identifier):
                    paths=source_paths(INDEX[identifier])
                    return study_prices(identifier,tuple(p.stat().st_mtime_ns for p in paths))
                self.send_json(event_study.run(DATA,payload,INDEX,columns,START,END))
                return
            if route == '/api/news-stats':
                event_ids=list(dict.fromkeys(payload['newsIds']))
                available={event['id']:event for event in news_data.catalog(DATA)}
                if any(event_id not in available for event_id in event_ids):
                    raise ValueError('Неизвестное событие')
                offset_start,offset_end=int(payload['offsetStart']),int(payload['offsetEnd'])
                if offset_start%15 or offset_end%15 or not -10080<=offset_start<offset_end<=10080:
                    raise ValueError('Окно должно быть кратно 15 минутам, от −7 до +7 дней')
                left,right=int(payload['start']),int(payload['end'])
                if left>=right:raise ValueError('Некорректный период')
                events=[available[key] for key in event_ids if left<=available[key]['anchor']<right]
                def closes(identifier):
                    paths=source_paths(INDEX[identifier])
                    return load_prices(identifier,tuple(p.stat().st_mtime_ns for p in paths))[3]
                self.send_json(news_data.summarize_events(events,ids,closes,offset_start,offset_end,START,END))
                return
            start, end, step = (int(payload[k]) for k in ['start', 'end', 'step'])
            if step < BASE or step > 604800 or step % BASE:
                raise ValueError('Свеча должна быть кратна 15 минутам и не больше недели')
            if not START <= start < end <= END:
                raise ValueError('Выберите период внутри доступной истории')
            # Complete UTC-aligned buckets only, including the dataset's first day for weekly bars.
            first = START + math.ceil((start - START) / step) * step
            stop = START + ((end - START) // step) * step
            if stop <= first:
                raise ValueError('В выбранном периоде нет полной свечи такого размера')
            candles = payload.get('kind') == 'candles'
            records = list(POOL.map(aggregate, [(i, first, stop, step, candles) for i in ids]))
            self.send_json(dict(start=first, end=stop, step=step, series=records))
        except (KeyError, TypeError, ValueError, json.JSONDecodeError) as error:
            self.send_json({'error': str(error)}, 400)
        except Exception as error:
            print('Data error:', error, flush=True)
            self.send_json({'error': 'Не удалось прочитать локальные данные. Подробности в окне сервера.'}, 500)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--port', type=int, default=8765)
    args = parser.parse_args()
    server = ThreadingHTTPServer(('127.0.0.1', args.port), Handler)
    print(f'Crypto Workspace · http://127.0.0.1:{args.port}', flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        server.server_close()
        POOL.shutdown(wait=False, cancel_futures=True)
