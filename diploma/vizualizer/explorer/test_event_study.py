"""Run: python3 -m unittest discover -s vizualizer/explorer -p 'test_event_study.py'."""
from copy import deepcopy
import math
from pathlib import Path
import unittest
from unittest.mock import patch
import event_study as study


def columns(closes):
    return [list(closes),[c*1.02 for c in closes],[c*.99 for c in closes],list(closes),[i+1.0 for i in range(len(closes))]]


def event(identifier,anchor=2700,region='US',**extra):
    return dict(id=identifier,title=identifier,anchor=anchor,date='1970-01-01',time='1970-01-01T00:45:00Z',region=region,precision='publication',labels={},**extra)


class StudyTests(unittest.TestCase):
    def setUp(self):
        self.data=columns([100,101,103,102,105,106,108,104,109,110,111,112])
        self.root=Path('/unused')
        self.request=dict(ids=['a'],mode='selected',newsIds=['one'],offsetStart=0,offsetEnd=15,start=0,end=10800)
        self.series={'a':{'region':'US'},'b':{'region':'US'},'hk':{'region':'HK'}}

    def run_study(self,records,request=None,data=None):
        meta=dict(records=records,chainTypes={'auction':'Auction'},features=study.FEATURES)
        with patch.object(study,'semantic_catalog',return_value=meta),patch.object(study.news_data,'catalog',return_value=records):
            return study.run(self.root,request or self.request,self.series,lambda i:(data or {'a':self.data})[i],0,10800)

    def test_metric_formulas(self):
        prices=study.PriceWindows(self.data,0,10800)
        metrics,reason=prices.reaction(2700,0,15)
        self.assertEqual(reason,'ok')
        self.assertAlmostEqual(metrics['return']['before'],100*(103/101-1))
        self.assertAlmostEqual(metrics['return']['after'],100*(102/103-1))
        self.assertAlmostEqual(metrics['volatility']['after'],100*abs(math.log(102/103)))
        self.assertAlmostEqual(metrics['upside']['after'],100*(102*1.02/103-1))
        self.assertAlmostEqual(metrics['downside']['after'],100*(102*.99/103-1))
        self.assertEqual(metrics['up_share']['after'],0)
        self.assertAlmostEqual(metrics['volume']['after'],4/3)
        self.assertAlmostEqual(metrics['volume']['delta'],1/3)
        metrics,_=prices.reaction(2700,15,30)
        self.assertAlmostEqual(metrics['return']['before'],100*(103/101-1),'baseline stays before event when post window is delayed')

    def test_three_points_and_unequal_duration_volume_rates(self):
        prices=study.PriceWindows(self.data,0,10800)
        metrics,reason=prices.reaction_points(4500,-30,-15,15)
        self.assertEqual(reason,'ok')
        # Before: bar 3, after: bars 4 and 5; split is t-15, not t0.
        self.assertAlmostEqual(metrics['return']['before'],100*(102/103-1))
        self.assertAlmostEqual(metrics['return']['after'],100*(106/102-1))
        self.assertAlmostEqual(metrics['volume']['after'],((5+6)/30)/(4/15))
        result=self.run_study([event('one',4500)],{**self.request,'t1':-30,'t2':-15,'t3':15})
        self.assertEqual(result['windows'],{'before':[-30,-15],'after':[-15,15]})
        self.assertEqual(result['groups'][0]['metrics']['return']['before'],metrics['return']['before'])
        self.assertEqual(result['experiment']['windows'],result['windows'])
        self.assertTrue(any('Длины окон' in text for text in result['warnings']))
        for invalid in [{'t1':0,'t2':0,'t3':15},{'t1':-15,'t2':0,'t3':16},{'t1':-15,'t2':None,'t3':15},{'t1':-10095,'t2':0,'t3':15}]:
            with self.assertRaises(ValueError):self.run_study([event('one')],{**self.request,**invalid})

    def test_missing_and_bounds(self):
        prices=study.PriceWindows(self.data,0,10800)
        self.assertEqual(prices.reaction(900,0,15)[1],'outside_history')
        self.assertEqual(prices.reaction(2710,0,15)[1],'intrabar_time')
        self.assertEqual(prices.reaction(10800,0,15)[1],'outside_history')
        data=deepcopy(self.data);data[3][1]=float('nan')
        self.assertEqual(study.PriceWindows(data,0,10800).reaction(2700,0,15)[1],'missing_trades')

    def test_deduplicate_and_equal_event_weights(self):
        records=[event('one'),event('duplicate'),event('later',4500)]
        request={**self.request,'newsIds':['one','duplicate','later'],'ids':['a','b']}
        b=deepcopy(self.data);b[3][4]=float('nan')
        result=self.run_study(records,request,{'a':self.data,'b':b});g=result['groups'][0]
        self.assertEqual(g['events'],3);self.assertEqual(g['usableMoments'],2);self.assertEqual(g['pairWindows'],3)
        expected=study.mean(study.PriceWindows(self.data,0,10800).reaction(t,0,15)[0]['return']['after'] for t in [2700,4500])
        self.assertAlmostEqual(g['metrics']['return']['after'],expected)

    def test_unknown_is_not_no_and_missing_is_not_zero(self):
        yes=event('yes');yes['labels']={'rate_cut':'yes'}
        unknown=event('unknown');unknown['labels']={'rate_cut':'unknown'}
        request={**self.request,'mode':'binary','feature':'rate_cut'}
        result=self.run_study([yes,unknown],request)
        self.assertEqual(result['unknown'],1);self.assertEqual(result['groups'][1]['events'],0)
        self.assertIsNone(result['comparisons'][0]['metrics']['return'])
        self.assertIsNone(result['groups'][1]['metrics']['return']['after'])

    def test_date_only_and_day_validation(self):
        record=event('one');record['precision']='day';record['time']=''
        result=self.run_study([record]);self.assertEqual(result['groups'][0]['excluded']['date_only'],1)
        self.assertEqual(result['groups'][0]['usableMoments'],0)
        with self.assertRaises(ValueError):self.run_study([record],{**self.request,'precision':'day'})
        with self.assertRaises(ValueError):self.run_study([record],{**self.request,'offsetEnd':16})
        with self.assertRaises(ValueError):self.run_study([record],{**self.request,'offsetEnd':15.5})

    def test_chain_requires_same_pair(self):
        records=[event('prepare',stage='preparation',kind='chain',chainId='chain',chainType='auction',confidence='explicit',confirmed=True),event('finish',6300,stage='outcome',kind='chain',chainId='chain',chainType='auction',confidence='explicit',confirmed=True)]
        request={**self.request,'mode':'chains','chainType':'all','ids':['a','b']}
        a=deepcopy(self.data);b=deepcopy(self.data);a[3][6]=float('nan');b[3][2]=float('nan')
        result=self.run_study(records,request,{'a':a,'b':b})
        self.assertEqual([g['usableMoments'] for g in result['groups']],[1,1])
        self.assertEqual(result['comparisons'][0]['n'],0)
        self.assertIsNone(result['comparisons'][0]['metrics']['return'])
        result=self.run_study(records,request,{'a':self.data,'b':self.data})
        self.assertEqual(result['comparisons'][0]['n'],1);self.assertEqual(result['comparisons'][0]['pairWindows'],2)

    def test_local_region_and_china_proxy(self):
        record=event('one',region='CN')
        result=self.run_study([record],{**self.request,'ids':['a','hk'],'localOnly':True},{'a':self.data,'hk':self.data})
        self.assertEqual(result['groups'][0]['pairWindows'],1);self.assertEqual(result['eventRows'][0]['usablePairs'],1)

    def test_saved_semantic_counts(self):
        root=Path(__file__).resolve().parents[2]/'regional_crypto_15m'
        if not root.exists():self.skipTest('Local research data absent')
        counts=study.semantic_catalog(root)['counts']
        self.assertEqual(counts['rate_cut'],{'yes':14,'no':23,'unknown':18})
        self.assertEqual(counts['bank_approved'],{'yes':24,'no':1})
        self.assertEqual(counts['chain_confirmed'],{'yes':51,'unknown':3})

    def test_grouped_metrics_are_recomputed_and_metadata_complete(self):
        self.series['a'].update(asset='BTC',group='base',group_label='Базовые',pair='BTC-USD',quote='USD',exchange='Test')
        self.series['b'].update(asset='DOGE',group='meme',group_label='Мемкоины',pair='DOGE-USD',quote='USD',exchange='Test')
        records=[event('one'),event('later',6300)];records[0]['family']='policy';records[1]['family']='labor'
        b=deepcopy(self.data);b[3][6]=float('nan')
        request={**self.request,'ids':['a','b'],'assets':['BTC','DOGE'],'regions':['US'],'newsIds':['one','later'],'groupByCoins':'group','groupByNews':'family'}
        result=self.run_study(records,request,{'a':self.data,'b':b})
        self.assertEqual(len(result['partitions']),4)
        for part in result['partitions']:
            ids=[pair['id'] for pair in part['selection']['pairs']]
            news_ids=['one'] if part['newsGroup']=='Ставки и денежная политика' else ['later']
            independent=self.run_study(records,{**self.request,'ids':ids,'newsIds':news_ids},{'a':self.data,'b':b})
            self.assertEqual(part['result']['groups'][0]['metrics'],independent['groups'][0]['metrics'])
        experiment=result['experiment']
        self.assertEqual(experiment['selection']['assets'],['BTC','DOGE'])
        self.assertEqual(experiment['selection']['regions'],[{'id':'US','label':'США'}])
        self.assertEqual(len(experiment['events']),2)
        self.assertEqual(experiment['grouping'],{'coins':'group','news':'family'})
        self.assertEqual(experiment['parameters']['offsetEnd'],15)

    def test_selected_assets_without_available_pairs_stay_in_metadata(self):
        self.series['a']['asset']='BTC';self.series['b']['asset']='DOGE'
        result=self.run_study([event('one')],{**self.request,'assets':['BTC','DOGE'],'regions':['US']})
        self.assertEqual(result['experiment']['selection']['assets'],['BTC','DOGE'])
        self.assertEqual(len(result['experiment']['selection']['pairs']),1)

    def test_real_csv_six_metrics(self):
        import csv
        root=Path(__file__).resolve().parents[2]/'regional_crypto_15m'
        if not root.exists():self.skipTest('Local research data absent')
        import server
        item=next(row for row in server.SERIES if row['asset']=='BTC' and row['region']=='US')
        record=next(row for row in study.semantic_catalog(root)['records'] if row.get('kind')=='bank' and row['precision']!='day' and not row['anchor']%900)
        rows=[]
        for path in server.source_paths(item):
            with path.open(encoding='utf-8-sig',newline='') as handle:rows.extend(csv.DictReader(handle))
        anchor=record['anchor'];first=(anchor-server.START)//900;last=first+4
        baseline=float(rows[first-1]['close']);window=rows[first:last];previous=baseline;variance=0
        for row in window:
            self.assertEqual(row['status'],'traded');close=float(row['close']);variance+=math.log(close/previous)**2;previous=close
        paths=server.source_paths(item);prices=server.load_prices(item['id'],tuple(p.stat().st_mtime_ns for p in paths))
        actual,reason=study.PriceWindows(prices,server.START,server.END).reaction(anchor,0,60);self.assertEqual(reason,'ok')
        expected={'return':100*(previous/baseline-1),'volatility':100*math.sqrt(variance),'upside':max(0,100*(max(float(r['high']) for r in window)/baseline-1)),'downside':min(0,100*(min(float(r['low']) for r in window)/baseline-1)),'up_share':100.0 if previous>baseline else 0.0,'volume':sum(float(r['volume_base']) for r in window)/sum(float(r['volume_base']) for r in rows[first-4:first])}
        for key,value in expected.items():self.assertAlmostEqual(actual[key]['after'],value,places=7,msg=key)


if __name__=='__main__':unittest.main()
