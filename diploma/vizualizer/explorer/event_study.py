"""Descriptive event studies on saved semantic labels and original 15-minute bars."""
from array import array
from collections import Counter, defaultdict
from datetime import datetime, timezone
from functools import lru_cache
import json
import math
import statistics
import hashlib
import news_data

FEATURES = {
    'rate_cut': 'Объявлено снижение ставки',
    'rate_hike': 'Объявлено повышение ставки',
    'rate_unchanged': 'Объявлено сохранение ставки',
    'bank_approved': 'Банковская заявка одобрена ФРС',
    'chain_confirmed': 'Следующий этап анонса подтверждён',
    'schedule_changed': 'Дата публикации перенесена · реакция в плановое время',
}
STAGES = {'preparation': 'Анонс / подготовка', 'speculation': 'Сообщение об ажиотаже', 'outcome': 'Итог / проведение'}
METRICS = [
    dict(key='return', label='Доходность', unit='%', deltaUnit='п.п.', description='Изменение закрытия относительно последнего закрытия перед окном.'),
    dict(key='volatility', label='Реализованная волатильность', unit='%', deltaUnit='п.п.', description='100 × корень суммы квадратов 15-минутных лог-доходностей, без годового пересчёта.'),
    dict(key='upside', label='Максимальный рост от старта', unit='%', deltaUnit='п.п.', description='Лучшее отклонение high от цены перед окном, не меньше нуля.'),
    dict(key='downside', label='Худшее отклонение от старта', unit='%', deltaUnit='п.п.', description='Худшее отклонение low от цены перед окном, не больше нуля; это не peak-to-trough drawdown.'),
    dict(key='up_share', label='Доля выросших пар', unit='%', deltaUnit='п.п.', description='Доля пригодных пар с положительной доходностью; сначала внутри события, затем между моментами выхода.'),
    dict(key='volume', label='Объём к базовому окну', unit='×', deltaUnit='×', description='Объём в минуту каждой пары после / до; базовый уровень 1×. Учитывает разную длину окон. Разные монеты и валюты в абсолютном объёме не суммируются.'),
]
KEYS = [m['key'] for m in METRICS]
REASONS = {'date_only':'Известна только дата', 'intrabar_time':'Время внутри 15-минутной свечи',
           'outside_history':'Окно за границей истории', 'missing_trades':'Пропуски / нет торгов в базовом или событийном окне',
           'unknown_outcome':'Исход неизвестен', 'no_local_series':'Нет выбранной пары региона события'}


@lru_cache(maxsize=1)
def semantic_catalog(root):
    source = root / 'news_semantics_2025_07_2026_06'
    news = news_data.catalog(root)
    by_news = {e['news_id']: e for e in news if e.get('news_id')}
    by_id = {e['id']: e for e in news}
    records, chain_types = [], {}

    def event(identifier, region, date, title, utc='', urls=(), news_ids=(), calendar_ids=(), **extra):
        candidates = [by_news[n] for n in news_ids if n in by_news]
        candidates += [by_id['cal:'+n] for n in calendar_ids if 'cal:'+n in by_id]
        links = {u.rstrip('/') for u in urls if u}
        candidates += [e for e in news if e['region']==region and e['date']==date and e['url'].rstrip('/') in links]
        candidates = list({e['id']:e for e in candidates if e['date']==date}.values())
        timed = sorted((e for e in candidates if e.get('time')), key=lambda e:(e['precision']!='publication',e['anchor']))
        clock = utc or (timed[0]['time'] if timed else '')
        precision = ('publication' if utc else timed[0]['precision']) if clock else 'day'
        return dict(id=identifier,region=region,date=date,title=title,time=clock,
                    anchor=news_data.epoch(clock or date+'T00:00:00Z'),precision=precision,
                    time_basis='semantic_verified_publication_time' if utc else timed[0].get('time_basis',precision) if timed else 'date_only',
                    newsIds=[e['id'] for e in candidates],url=next(iter(urls),''),labels={},**extra)

    for i,row in enumerate(news_data.read_csv(source/'rate_decisions.csv')):
        labels={feature:('yes' if row[feature]=='1' else 'no' if row[feature]=='0' else 'unknown') for feature in ['rate_cut','rate_hike','rate_unchanged']}
        item=event('rate:'+row['region']+':'+row['date']+':'+str(i),row['region'],row['date'],
                   ' / '.join(json.loads(row['titles'])),urls=json.loads(row['urls']),
                   news_ids=json.loads(row['news_ids']),calendar_ids=json.loads(row['calendar_ids']),kind='rate',instrument=row['instrument_scope'])
        item['labels']=labels;records.append(item)
    for row in news_data.read_csv(source/'bank_application_outcomes.csv'):
        item=event('bank:'+row['event_id'],row['region'],row['date'],row['title'],urls=[row['url']],news_ids=[row['event_id']],kind='bank')
        item['labels']={'bank_approved':'yes' if row['yes']=='1' else 'no' if row['no']=='1' else 'unknown'};records.append(item)
    for row in news_data.read_csv(source/'event_chains.csv'):
        family=row['family'];chain_types[family]=row['family_label']
        common=dict(kind='chain',chainId=row['chain_id'],chainType=family,confidence=row['confidence'],confirmed=row['action_occurred']=='1')
        for stage in ['preparation','outcome']:
            date=row[stage+'_date'] or row['planned_date'] or row['preparation_date']
            item=event('chain:'+row['chain_id']+':'+stage,row['region'],date,row[stage+'_title'] or 'Итог не найден в архиве',
                       utc=row[stage+'_utc'],urls=[row[stage+'_url']],news_ids=[row[stage+'_id']],stage=stage,**common)
            if stage=='outcome' and row['confidence']=='explicit':item['labels']={'chain_confirmed':'yes' if row['action_occurred']=='1' else 'no' if row['action_occurred']=='0' else 'unknown'}
            records.append(item)
    for row in news_data.read_csv(source/'schedule_changes.csv'):
        # This is the revised release schedule, NOT the publication of postponement news.
        clock=row['revised_scheduled_utc']
        item=event('schedule:'+row['event_id'],row['region'],clock[:10],row['title'],utc=clock,urls=[row['source_url']],calendar_ids=[row['event_id']],kind='schedule')
        item.update(precision='scheduled',time_basis='revised_release_schedule',reference='revised_release_schedule',labels={'schedule_changed':'yes' if row['rescheduled']=='1' else 'no' if row['rescheduled']=='0' else 'unknown'})
        records.append(item)
    for row in news_data.read_csv(source/'three_stage_programme_chains.csv'):
        chain_types['stablecoin_programme']='Стейблкоины: подготовка → ажиотаж → лицензии'
        for prefix,stage in [('preparation','preparation'),('reported_speculation','speculation'),('licensing_outcome','outcome')]:
            item=event('programme:'+row['programme_id']+':'+stage,row['region'],row[prefix+'_date'],row[prefix+'_title'],
                       utc=row[prefix+'_utc'],urls=[row[prefix+'_url']],news_ids=[row[prefix+'_news_id']],kind='chain',stage=stage,
                       chainId=row['programme_id'],chainType='stablecoin_programme',confidence='programme',confirmed=True)
            records.append(item)
    counts={feature:dict(Counter(item['labels'][feature] for item in records if feature in item['labels'])) for feature in FEATURES}
    return dict(records=records,features=FEATURES,counts=counts,chainTypes=chain_types,stages=STAGES,metrics=METRICS)


class PriceWindows:
    """Prefix sums make realized variance/gap/volume checks constant-time."""
    def __init__(self, columns, start, end, step=900):
        self.columns,self.start,self.end,self.step=columns,start,end,step
        self.missing=array('i',[0]);self.variance=array('d',[0]);self.volume=array('d',[0])
        close=columns[3]
        for i,value in enumerate(close):
            good=math.isfinite(value) and value>0
            self.missing.append(self.missing[-1]+(not good))
            change=math.log(value/close[i-1]) if i and good and math.isfinite(close[i-1]) and close[i-1]>0 else 0
            self.variance.append(self.variance[-1]+change*change)
            vol=columns[4][i]
            self.volume.append(self.volume[-1]+(vol if math.isfinite(vol) and vol>0 else 0))

    def interval(self,left,right):
        if left>=right:raise ValueError('Окно должно иметь положительную длину')
        if left%self.step or right%self.step:return None,'intrabar_time'
        if left-self.step<self.start or right>self.end:return None,'outside_history'
        first=(left-self.start)//self.step;last=(right-self.start)//self.step
        if self.missing[last]-self.missing[first-1]:return None,'missing_trades'
        columns=self.columns;base=columns[3][first-1];ret=100*(columns[3][last-1]/base-1)
        return dict(return_value=ret,volatility=100*math.sqrt(max(0,self.variance[last]-self.variance[first])),
                    upside=max(0,100*(max(columns[1][first:last])/base-1)),
                    downside=min(0,100*(min(columns[2][first:last])/base-1)),
                    up_share=100.0 if ret>0 else 0.0,volume=self.volume[last]-self.volume[first]),'ok'

    def reaction(self,anchor,offset_start,offset_end):
        # Legacy callers retain a baseline ending at t0, including delayed windows.
        return self.compare(anchor,[-(offset_end-offset_start),0],[offset_start,offset_end])

    def reaction_points(self,anchor,t1,t2,t3):
        return self.compare(anchor,[t1,t2],[t2,t3])

    def compare(self,anchor,before_window,after_window):
        before,reason=self.interval(*(anchor+t*60 for t in before_window))
        if before is None:return None,reason
        after,reason=self.interval(*(anchor+t*60 for t in after_window))
        if after is None:return None,reason
        before['return']=before.pop('return_value');after['return']=after.pop('return_value')
        volume=(after['volume']/(after_window[1]-after_window[0]))/(before['volume']/(before_window[1]-before_window[0])) if before['volume']>0 else None
        before['volume']=1.0 if volume is not None else None;after['volume']=volume
        return {key:dict(before=before[key],after=after[key],delta=after[key]-before[key] if after[key] is not None else None) for key in KEYS},'ok'


def mean(values):
    values=[value for value in values if value is not None]
    return statistics.mean(values) if values else None


def aggregate_windows(windows):
    result={}
    for key in KEYS:
        # Equal weight to unique event times, after equal weighting of available pairs.
        values=[{field:window['sums'][key][i]/window['sums'][key][3] if window['sums'][key][3] else None for i,field in enumerate(['before','after','delta'])} for window in windows.values() if window['ids']]
        result[key]={field:mean(value[field] for value in values) for field in ['before','after','delta']}
        result[key]['n']=sum(value['after'] is not None for value in values)
    return result


def add_window(windows,anchor,identifier,value):
    window=windows.setdefault(anchor,dict(ids=set(),sums={key:[0.0,0.0,0.0,0] for key in KEYS}))
    if identifier in window['ids']:return
    window['ids'].add(identifier)
    for key in KEYS:
        metric=value[key]
        if metric['after'] is None:continue
        sums=window['sums'][key]
        for i,field in enumerate(['before','after','delta']):sums[i]+=metric[field]
        sums[3]+=1


def _run(root, request, series, load, start, end):
    mode=request.get('mode','selected');precision=request.get('precision','exact')
    if mode not in ['selected','binary','chains'] or precision not in ['exact','day']:raise ValueError('Неизвестный режим исследования')
    explicit=any(key in request for key in ['t1','t2','t3'])
    raw_offsets=[request.get(key) for key in ['t1','t2','t3']] if explicit else [request.get('offsetStart',0),request.get('offsetEnd',15)]
    try:
        if any(isinstance(value,bool) or not math.isfinite(float(value)) or not float(value).is_integer() for value in raw_offsets):raise ValueError()
        offsets=list(map(int,raw_offsets))
    except (ValueError,TypeError,OverflowError):raise ValueError('Смещения окна должны быть целыми минутами') from None
    if explicit:
        t1,t2,t3=offsets
        if any(t%15 for t in offsets) or not -10080<=t1<t2<t3<=10080:raise ValueError('−10080 ≤ t1 < t2 < t3 ≤ 10080 минут, шаг 15 минут')
        before_window,after_window=[t1,t2],[t2,t3]
    else:
        offset_start,offset_end=offsets
        if offset_start%15 or offset_end%15 or not 0<=offset_start<offset_end<=10080:raise ValueError('Для анализа после события: 0 ≤ От < До ≤ 10080 минут, шаг 15 минут')
        before_window,after_window=[-(offset_end-offset_start),0],[offset_start,offset_end]
    if precision=='day' and any(t%1440 for t in offsets):raise ValueError('В режиме дат задайте целые сутки: 1440, 2880, … минут')
    offset_start,offset_end=after_window
    left,right=int(request.get('start',start)),int(request.get('end',end))
    if left>=right:raise ValueError('Некорректный период событий')
    source=semantic_catalog(root);warnings=[]
    if before_window[1]-before_window[0]!=after_window[1]-after_window[0]:warnings.append('Длины окон До и После различаются: доходность, волатильность и экстремумы зависят от длительности. Только объём нормирован на минуту.')
    feature=request.get('feature','rate_cut');chain_type=request.get('chainType','all')
    if mode=='selected':
        chosen=set(request.get('newsIds',[]));known={e['id']:e for e in news_data.catalog(root)}
        if chosen-known.keys():raise ValueError('Неизвестное событие')
        records=[dict(known[key],cohort='selected') for key in chosen];labels={'selected':'Отмеченные новости'}
    elif mode=='binary':
        if feature not in FEATURES:raise ValueError('Неизвестный бинарный признак')
        records=[dict(item,cohort=item['labels'][feature]) for item in source['records'] if feature in item['labels']]
        labels={'yes':'Да','no':'Нет'}
        if feature=='schedule_changed':warnings.append('Для переносов t0 — обновлённое плановое время релиза. Время объявления переноса неизвестно; это не реакция на новость о переносе.')
        if feature.startswith('rate_'):warnings.append('Снижение, повышение и сохранение — три метки одних решений. Неизвестные исходы исключены; китайская запись относится к структурным инструментам, а не к основной ставке.')
    else:
        if chain_type!='all' and chain_type not in source['chainTypes']:raise ValueError('Неизвестный тип цепочки')
        records=[dict(item,cohort=item['stage']) for item in source['records'] if item['kind']=='chain' and item['confirmed']
                 and (request.get('includeWeak',False) or item['confidence']!='issuer_instrument_temporal_link')
                 and (chain_type=='all' or item['chainType']==chain_type)]
        labels={stage:label for stage,label in STAGES.items() if stage!='speculation' or any(item['stage']=='speculation' for item in records)}
        warnings.append('Сравнение этапов проводится на одних цепочках и одних торговых парах. Стадия итога может быть публикацией документа, а не началом его действия. Неподтверждённый итог не считается отрицательным.')
    if precision=='day':warnings.append('t0 условно равен 00:00 UTC даты события. Это дневное сопоставление, а не измерение мгновенной реакции на публикацию.')
    records=[item for item in records if left<=item['anchor']<right]
    if '_recordIds' in request:
        subset=set(request['_recordIds']);records=[item for item in records if item['id'] in subset]
    if request.get('localOnly'):warnings.append('Выбраны только пары региона события; для Китая используется Гонконг.')
    warnings.append('Разности описательные: причинность и статистическая значимость не установлены. Монеты одного события не являются независимыми событиями; возможны перекрытия окон и другие новости.')
    groups={key:dict(key=key,label=label,records=[],events=0,excluded=Counter(),windows={},values=defaultdict(dict)) for key,label in labels.items()}
    unknown=0;event_rows=[]
    for item in records:
        if item['cohort']=='unknown':unknown+=1;continue
        group=groups[item['cohort']];group['events']+=1
        anchor=item['anchor'] if precision=='exact' else item['anchor']//86400*86400
        reason='date_only' if precision=='exact' and item['precision']=='day' else 'intrabar_time' if anchor%900 else None
        record=dict(item,studyAnchor=anchor);event_rows.append(dict(id=item['id'],title=item['title'],region=item['region'],date=item['date'],time=item.get('time',''),cohort=item['cohort'],reason=reason,chainId=item.get('chainId')))
        if reason:group['excluded'][reason]+=1;continue
        group['records'].append(record);group['windows'].setdefault(anchor,[]).append(record)
    selected_series=list(dict.fromkeys(request['ids']));pair_exclusions={key:Counter() for key in groups}
    chain_map=defaultdict(dict)
    if mode=='chains':
        for group in groups.values():
            for record in group['records']:
                chain_map[record['chainId']][record['stage']]=record['studyAnchor']
                chain_map[record['chainId']]['_region']=record['region']
    stage_pairs=[(a,b) for a,b in [('preparation','outcome'),('preparation','speculation'),('speculation','outcome')] if a in groups and b in groups]
    paired={stages:{} for stages in stage_pairs}
    # Keep a small response cache per pair inside this request; load a pair only once.
    for identifier in selected_series:
        item=series[identifier];region=item['region'];needed=[]
        for key,group in groups.items():
            for anchor,items in group['windows'].items():
                if request.get('localOnly') and not any(('HK' if e['region']=='CN' else e['region'])==region for e in items):continue
                needed.append((key,anchor))
        if not needed:continue
        loaded=load(identifier);prices=loaded if isinstance(loaded,PriceWindows) else PriceWindows(loaded,start,end);cache={};needed_set=set(needed)
        for key,anchor in needed:
            if anchor not in cache:cache[anchor]=prices.compare(anchor,before_window,after_window)
            value,reason=cache[anchor]
            if value is None:pair_exclusions[key][reason]+=1
            else:add_window(groups[key]['values'],anchor,identifier,value)
        for stages,chain_values in paired.items():
            earlier,later=stages
            for chain_id,anchors in chain_map.items():
                if request.get('localOnly') and ('HK' if anchors['_region']=='CN' else anchors['_region'])!=region:continue
                if earlier not in anchors or later not in anchors or (earlier,anchors[earlier]) not in needed_set or (later,anchors[later]) not in needed_set:continue
                first=cache[anchors[earlier]][0];last=cache[anchors[later]][0]
                if first is None or last is None:continue
                sample=chain_values.setdefault(chain_id,dict(pairs=0,sums={key:[0.0,0] for key in KEYS}));sample['pairs']+=1
                for key in KEYS:
                    if first[key]['delta'] is not None and last[key]['delta'] is not None:
                        sample['sums'][key][0]+=last[key]['delta']-first[key]['delta'];sample['sums'][key][1]+=1
    outputs=[]
    for key,group in groups.items():
        times=sorted(group['values'])
        overlap=sum(b-a<(after_window[1]-before_window[0])*60 for a,b in zip(times,times[1:]))
        outputs.append(dict(key=key,label=group['label'],events=group['events'],eligibleEvents=len(group['records']),
                            moments=len(group['windows']),usableMoments=len(times),days=len({t//86400 for t in times}),
                            pairWindows=sum(len(window['ids']) for window in group['values'].values()),
                            seriesUsed=len({identifier for window in group['values'].values() for identifier in window['ids']}),
                            overlapping=overlap,excluded=dict(group['excluded']),pairExcluded=dict(pair_exclusions[key]),
                            metrics=aggregate_windows(group['values'])))
    comparisons=[]
    if mode=='binary':
        yes,no=outputs
        comparisons.append(dict(label='Разность изменений: Да − Нет',n=None,metrics={key:yes['metrics'][key]['delta']-no['metrics'][key]['delta'] if yes['metrics'][key]['delta'] is not None and no['metrics'][key]['delta'] is not None else None for key in KEYS}))
        if min(yes['usableMoments'],no['usableMoments'])<5:warnings.append('В одной из групп меньше пяти пригодных моментов выхода: устойчивое обобщение невозможно.')
        shared=set(groups['yes']['values'])&set(groups['no']['values'])
        if shared:warnings.append(f'В группах Да и Нет совпадают {len(shared)} моментов: это не независимые группы.')
    if mode=='chains':
        for (earlier,later),samples in paired.items():
            comparisons.append(dict(label=STAGES[later]+' − '+STAGES[earlier]+' · парные цепочки',n=len(samples),pairWindows=sum(sample['pairs'] for sample in samples.values()),metrics={key:mean(sample['sums'][key][0]/sample['sums'][key][1] for sample in samples.values() if sample['sums'][key][1]) for key in KEYS}))
    for row in event_rows:
        if row['reason']:row['usablePairs']=0;continue
        item=next(r for r in groups[row['cohort']]['records'] if r['id']==row['id']);valid_ids=groups[row['cohort']]['values'].get(item['studyAnchor'],{}).get('ids',[])
        row['usablePairs']=sum(not request.get('localOnly') or series[i]['region']==('HK' if row['region']=='CN' else row['region']) for i in valid_ids)
        if not row['usablePairs']:row['reason']='no_local_series' if request.get('localOnly') and not any(('HK' if row['region']=='CN' else row['region'])==series[i]['region'] for i in selected_series) else 'missing_trades'
    report=[f'До: [t{before_window[0]:+}, t{before_window[1]:+}) мин; После: [t{after_window[0]:+}, t{after_window[1]:+}) мин.']
    for group in outputs:
        reaction=group['metrics']['return']['delta'];report.append(f"{group['label']}: {group['usableMoments']} пригодных моментов из {group['events']} записей, {group['seriesUsed']} пар; изменение средней доходности относительно базового окна: {reaction:+.4f} п.п." if reaction is not None else f"{group['label']}: пригодных окон нет; отсутствие данных не означает нулевую реакцию.")
    if unknown:report.append(f'Неизвестных исходов исключено: {unknown}.')
    return dict(mode=mode,precision=precision,feature=feature if mode=='binary' else None,offsetStart=offset_start,offsetEnd=offset_end,
                windows=dict(before=before_window,after=after_window),
                start=left,end=right,selectedPairs=len(selected_series),events=len(records),unknown=unknown,
                metrics=METRICS,groups=outputs,comparisons=comparisons,warnings=warnings,report=report,
                eventRows=event_rows[:500],eventRowsTruncated=len(event_rows)>500,reasons=REASONS,_records=records)


REGION_NAMES={'US':'США','EU':'Еврозона','ID':'Индонезия','TH':'Таиланд','KR':'Южная Корея','HK':'Гонконг','AE':'ОАЭ','CN':'Китай'}


def run(root, request, series, load, start, end):
    """Recompute disjoint asset/news slices; never average pre-aggregated tables."""
    request={key:value for key,value in request.items() if not key.startswith('_')}
    coin_grouping=request.get('groupByCoins','all');news_grouping=request.get('groupByNews','all')
    if coin_grouping not in ['all','group'] or news_grouping not in ['all','family']:raise ValueError('Неизвестная группировка')
    result=_run(root,request,series,load,start,end);records=result.pop('_records')
    ids=list(dict.fromkeys(request['ids']))
    available_assets={item.get('asset',key) for key,item in series.items()};available_regions={item['region'] for item in series.values()}
    assets=sorted(set(request.get('assets',[series[i].get('asset',i) for i in ids])))
    regions=sorted(set(request.get('regions',[series[i]['region'] for i in ids])))
    if set(assets)-available_assets or set(regions)-available_regions:raise ValueError('Неизвестная монета или регион в параметрах эксперимента')
    source=semantic_catalog(root)

    def news_bucket(item):
        if item.get('kind')=='chain':return 'chain:'+item['chainType'],source['chainTypes'][item['chainType']]
        key={'rate':'policy','bank':'regulation'}.get(item.get('kind'),item.get('family') or news_data.family(item['title']))
        return key,news_data.LABELS.get(key,key)

    def selection(subids,subassets=None):
        return dict(assets=sorted(set(subassets if subassets is not None else [series[i].get('asset',i) for i in subids])),
                    regions=[dict(id=r,label=REGION_NAMES.get(r,r)) for r in regions],
                    pairs=[dict(id=i,**{key:series[i].get(key,i if key=='asset' else '') for key in ['asset','region','pair','quote','exchange','group','group_label']}) for i in subids])

    coin_sets={};news_sets={}
    if coin_grouping=='group':
        # Include selected assets with no pair in selected regions in experiment metadata.
        for asset in assets:
            item=next((value for key,value in series.items() if value.get('asset',key)==asset),{})
            key=item.get('group','ungrouped');entry=coin_sets.setdefault(key,dict(label=item.get('group_label',key),assets=[],ids=[]));entry['assets'].append(asset)
        for identifier in ids:coin_sets[series[identifier].get('group','ungrouped')]['ids'].append(identifier)
    else:coin_sets['all']=dict(label='Все выбранные монеты',assets=assets,ids=ids)
    if news_grouping=='family':
        for item in records:
            key,label=news_bucket(item);entry=news_sets.setdefault(key,dict(label=label,ids=[]));entry['ids'].append(item['id'])
    else:news_sets['all']=dict(label='Все выбранные новости',ids=[item['id'] for item in records])
    partitions=[]
    if coin_grouping!='all' or news_grouping!='all':
        for coin_key,coins in coin_sets.items():
            for news_key,news in news_sets.items():
                payload={**request,'ids':coins['ids'],'_recordIds':news['ids']}
                part=_run(root,payload,series,load,start,end);part.pop('_records')
                partitions.append(dict(id=coin_key+'|'+news_key,label=coins['label']+' × '+news['label'],
                                       coinGroup=coins['label'],newsGroup=news['label'],selection=selection(coins['ids'],coins['assets']),result=part))
    event_metadata=[dict(id=item['id'],title=item['title'],region=item['region'],date=item['date'],time=item.get('time',''),
                         precision=item['precision'],timeBasis=item.get('time_basis',item['precision']),reference=item.get('reference'),
                         newsGroup=news_bucket(item)[1],cohort=item['cohort'],chainId=item.get('chainId'),stage=item.get('stage'),
                         confidence=item.get('confidence'),instrument=item.get('instrument'),url=item.get('url','')) for item in records]
    parameters={key:value for key,value in request.items() if key!='newsIds'}
    fingerprint=hashlib.sha256(json.dumps(request,sort_keys=True,ensure_ascii=False).encode()).hexdigest()[:16]
    result['experiment']=dict(id=fingerprint,createdUtc=datetime.now(timezone.utc).isoformat(),selection=selection(ids,assets),
                              newsTypes=sorted({item['newsGroup'] for item in event_metadata}),
                              featureLabel=FEATURES.get(request.get('feature')) if request.get('mode')=='binary' else None,
                              parameters=parameters,selectedNewsIds=list(request.get('newsIds',[])),events=event_metadata,
                              windows=result['windows'],baseline='До: [t%+d, t%+d) минут относительно события.' % tuple(result['windows']['before']),
                              weighting='Среднее по пригодным парам внутри момента, затем равный вес уникальным моментам; этапы сопоставлены на общих парах одной цепочки.',
                              sources=['news_semantics_2025_07_2026_06','news_ab_2025_07_2026_06/price_series.json'],
                              grouping=dict(coins=coin_grouping,news=news_grouping))
    result['partitions']=partitions
    return result
