"""News catalog and descriptive 15-minute event-window returns."""
import csv
from datetime import datetime, timezone
from functools import lru_cache
import math
import html
import re
import statistics

LABELS = {
 'policy':'Ставки и денежная политика','inflation':'Инфляция и цены','labor':'Занятость и доходы',
 'activity':'ВВП, производство и продажи','surveys':'PMI и деловые опросы','trade':'Внешняя торговля',
 'credit':'Кредит и финансовая статистика','housing':'Жильё и строительство','auction':'Аукционы и размещения',
 'regulation':'Регулирование и лицензии','crypto':'Криптовалюты и технологии','politics':'Политика и международные отношения',
 'corporate':'Компании и инвестиции','communication':'Выступления и мероприятия','routine':'Ежедневные обновления',
 'other':'Прочие новости и статистика'}


def read_csv(path):
    with path.open(encoding='utf-8-sig', newline='') as handle:
        return list(csv.DictReader(handle))


def family(title, kind='', daily=False,category=''):
    text=title.lower()
    if daily:return 'routine'
    if kind=='auction_security' or any(t in text for t in ['tender','auction','issuance','renminbi bills']):return 'auction'
    if any(t in text for t in ['fomc','policy decision','monetary policy','base rate','policy rate','benchmark rate','bi-rate']):return 'policy'
    if any(t in text for t in ['inflation','consumer price','producer price','hicp','wholesale price']):return 'inflation'
    if any(t in text for t in ['employment','labor','labour','earnings','job openings','wage']):return 'labor'
    if any(t in text for t in ['pmi','business survey','business expectations','consumer confidence']):return 'surveys'
    if any(t in text for t in ['gdp','gross domestic','national economic','industrial production','retail','manufacturers','durable goods','personal income and outlays']):return 'activity'
    if any(t in text for t in ['export','import','foreign trade','balance of payments']):return 'trade'
    if any(t in text for t in ['housing','construction','mortgage','residential','building']):return 'housing'
    if any(t in text for t in ['licen','regulat','consultation','supervis','enforcement','approval of','denies application']):return 'regulation'
    if any(t in text for t in ['crypto','stablecoin','blockchain','digital asset','token','bitcoin','artificial intelligence']):return 'crypto'
    if any(t in text for t in ['president','minister','diplomat','ceasefire','war','defence','defense','condemn','bilateral']):return 'politics'
    if any(t in text for t in ['money','credit','reserve','financial','liquidity','h.4','h.8','h.10','g.5','interest rate']):return 'credit'
    if any(t in text for t in ['investment','company','companies','business','capital','financing','partnership','launch']):return 'corporate'
    if kind in ['speech','conference'] or any(t in text for t in ['speech','conference','summit','forum','remarks']):return 'communication'
    return {'prices_inflation':'inflation','labour':'labor','gdp':'activity','business_confidence':'surveys','consumer_sentiment':'surveys','foreign_trade':'trade','housing':'housing','debt_auctions':'auction','interest_rates':'credit'}.get(category,'other')


def epoch(value):
    return int(datetime.fromisoformat(value.replace('Z','+00:00')).timestamp())


@lru_cache(maxsize=1)
def catalog(root):
    records=[]
    calendar=read_csv(root/'news_calendar_2025_08_2026_06/events_2025_07_2026_06.csv')
    calendar_links={}
    for row in calendar:
        timed=row['event_time_utc']
        item=dict(id='cal:'+row['event_id'],title=row['event_title'],region=row['region'],source=row['source'],
            date=row['event_date_local'],time=timed,anchor=epoch(timed or row['event_date_local']+'T00:00:00Z'),
            precision='scheduled' if timed else 'day',time_basis=row['time_basis'],url=row['source_url'],
            family=family(row['event_title'],row['record_type'],row['routine_daily_data_update']=='1',row['category']),
            reference=row['reference_period'],actual=row['actual'],unit=row['unit'],note=row['verification_note'],
            description='',body_available=False,news_id='')
        records.append(item)
        calendar_links.setdefault((item['region'],item['date'],item['url'].rstrip('/')),[]).append(item)
    seen=set()
    for filename in ['news_2025H2_2026H1/news_log.csv','news_calendar_2025_07/news_log.csv']:
        for row in read_csv(root/filename):
            key=row['region'],row['url'].rstrip('/')
            if key in seen:continue
            seen.add(key)
            matches=calendar_links.get((row['region'],row['published_date'],row['url'].rstrip('/')),[])
            if len(matches)==1:
                matches[0]['publication_time']=row['published_utc']
                matches[0]['news_id']=row['news_id']
                continue
            timed=row['published_utc']
            records.append(dict(id='news:'+row['news_id'],title=row['title'],region=row['region'],source=row['source'],
                date=row['published_date'],time=timed,anchor=epoch(timed or row['published_date']+'T00:00:00Z'),
                precision='publication' if timed else 'day',time_basis=row['timestamp_basis'],url=row['url'],
                family=family(row['title']),reference='',actual=row.get('actual',''),unit=row.get('unit',''),
                note=row['timestamp_basis'],description=row.get('description',''),body_available=bool(row.get('description')),news_id=row['news_id']))
    records.sort(key=lambda item:(item['anchor'],item['region'],item['id']))
    return records


def window_return(closes, anchor, offset_start, offset_end, start, end, step=900):
    left=anchor+offset_start*60
    right=anchor+offset_end*60
    if left%step or right%step:return None,'intrabar_time'
    if left-step<start or right>end:return None,'outside_history'
    first=(left-start)//step-1
    last=(right-start)//step-1
    values=closes[first:last+1]
    if len(values)!=last-first+1 or not values or any(not math.isfinite(v) or v<=0 for v in values):return None,'missing_trades'
    return 100*(values[-1]/values[0]-1),'ok'


def summarize_events(events, series, load, offset_start, offset_end, start, end):
    results={item['id']:[] for item in events}
    reasons={item['id']:{} for item in events}
    eligible=[item for item in events if item['precision']!='day']
    for identifier in series if eligible else []:
        closes=load(identifier)
        for item in eligible:
            value,reason=window_return(closes,item['anchor'],offset_start,offset_end,start,end)
            if value is not None:results[item['id']].append(value)
            else:reasons[item['id']][reason]=reasons[item['id']].get(reason,0)+1
    rows=[]
    for item in events:
        values=results[item['id']]
        rows.append(dict(id=item['id'],n=len(values),mean=sum(values)/len(values) if values else None,
            absolute=sum(abs(v) for v in values)/len(values) if values else None,
            excluded={'date_only':len(series)} if item['precision']=='day' else reasons[item['id']]))
    anchors={item['id']:item['anchor'] for item in events}
    unique={anchors[row['id']]:row for row in rows if row['n']}
    available=list(unique.values())
    return dict(events=len(events),windows=len({item['anchor'] for item in eligible}),usable=len(available),pairs=sum(row['n'] for row in available),
        mean=statistics.mean(row['mean'] for row in available) if available else None,
        absolute=statistics.mean(row['absolute'] for row in available) if available else None,
        rows=rows,offset_start=offset_start,offset_end=offset_end)


@lru_cache(maxsize=128)
def detail(root,identifier):
    record=next((item for item in catalog(root) if item['id']==identifier),None)
    if record is None:raise ValueError('Неизвестное событие')
    text=''
    if record['news_id']:
        path=root/'news_semantics_2025_07_2026_06/raw'/(record['news_id']+'.txt')
        if path.exists():
            text=path.read_text()
            text=html.unescape(re.sub(r'<[^>]+>',' ',text.replace('\\r\\n','\n')))
            title=record['title']
            position=text.rfind(title)
            if position>=0:text=text[position:]
            elif record['region']=='TH':
                match=re.search(r'The Committee voted',text)
                text=text[match.start():] if match else ''
            else:text=''
            for marker in ['Latest Press Releases','For media inquiries','Last Update:', 'Share Back to Top']:
                if marker in text:text=text.split(marker,1)[0]
    if not text and record.get('description'):text=record['description']
    return dict(id=identifier,text=text[:16000],truncated=len(text)>16000,available=bool(text))
