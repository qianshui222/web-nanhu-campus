"""Generate the visual asset set without editing the shared campus scene."""
import argparse
import json
from math import atan2, cos, hypot, sin
from pathlib import Path
import sys

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parent))
import build_campus as base

base.PALETTE = json.loads(Path(__file__).with_name('studio-palette.json').read_text(encoding='utf-8-sig'))


class StudioBuilding(base.Building):
    def prism(self, hull, lo, hi, color, part='form'):
        # All masses and trim fit inside the authoritative envelope.
        def limit(n, half):
            return min(half, max(-half,n))

        hull = [(limit(x,self.w/2),limit(z,self.d/2)) for x,z in hull]
        if hi>0 and lo<self.h:
            super().prism(hull,max(lo,0),min(hi,self.h),color,part)

    def podium(self, rise, color='stone'):
        self.box(self.w,.29,self.d,0,0,0,'foundation')
        self.box(self.w-.06,rise,self.d-.06,0,.20,0,color,bevel=.26)
        self.box(self.w-.06,.18,self.d-.06,0,rise+.12,0,'cap',bevel=.2)

    def storeys(self, side, count, start, end, levels, phase=0, wide=.77):
        horizontal = self.w if side in ('north','south') else self.d
        pitch = horizontal*.91/count
        height = (end-start)/levels
        doorway = {'canteen':6.7,'complex':7.2,'hall':6.1,'annex':self.w*.39}.get(
            self.place['style'],min(self.w,self.d)*.35)
        clearance = min(doorway,horizontal*.62)*.5
        # A framed cassette has its glass behind the sill and projecting vertical jambs.
        for row in range(levels):
            y=start+height*row
            for column in range(count):
                x=(column-(count-1)/2)*pitch
                width=pitch*wide
                if side==self.front and y<min(3.38,self.h*.44) and abs(x-self.offset)<clearance+width*.48:
                    continue
                role='glowing' if (column*3+row+phase)%11==0 else 'glaze'
                tone=('glass-cool','glass-muted','glass-cool','glass-light')[(column//3+row//2+phase)%4]
                self.facade(side,x,y+height*.19,-.32,width,height*.65,.10,tone,role)
                self.facade(side,x,y+height*.14,-.17,width+.08,.13,.29,'sill')
                for sign in (-1,1):
                    self.facade(side,x+sign*(width*.5+.025),y+height*.185,-.19,.10,height*.71,.23,'frame')
                self.facade(side,x,y+height*.84,-.26,width+.08,.09,.19,'frame')
            ends=[(-horizontal*.47,horizontal*.47)]
            if side==self.front and y<min(3.38,self.h*.44):
                ends=[(-horizontal*.47,self.offset-clearance),(self.offset+clearance,horizontal*.47)]
            for a,b in ends:
                if b-a>.13:self.facade(side,(a+b)/2,y+.065,-.38,b-a,.12,.18,'shadow-band','form')

    def recessed_shell(self, w, d, start, end, color, entrance, lintel, bevel=.21):
        nx,nz=base.SIDES[self.front]
        u=(w if nz else d)/2
        v=(d if nz else w)/2
        half=min(entrance/2,u*.48)
        opening=max(-u+half+.24,min(u-half-.24,self.offset))
        cut=min(v*.68,1.37)
        plane=[(-u,-v),(u,-v),(u,v),(opening+half,v),(opening+half,v-cut),
               (opening-half,v-cut),(opening-half,v),(-u,v)]
        if lintel>start:
            self.prism([(x*nz+z*nx,z*nz-x*nx) for x,z in plane],start,lintel,color)
        self.box(w,end-lintel,d,0,lintel,0,color,bevel=bevel)

    def gate_portal(self, width, depth=.96, height=2.9, sign=False):
        side,x=self.front,self.offset
        width=min(width,(self.w if side in ('north','south') else self.d)*.62)
        height=min(height,self.h*.46)
        self.facade(side,x,.22,-depth,width,height-.08,.13,'glass-cool','glaze')
        for u in (-width*.53,width*.53):
            self.facade(side,x+u,.18,-.36,.30,height,.60,'cap','form')
        self.facade(side,x,height,.0,width+1.06,.23,1.02,'cap','form')
        self.facade(side,x,height+.225,-.33,width+.73,.16,.49,'roof','form')
        self.facade(side,x,height-.04,-.47,width+.07,.065,.72,'soffit','relief')
        self.facade(side,x,height-.084,-.58,width*.48,.038,.19,'cap','relief')
        for i in range(3):
            self.facade(side,x,0,-.11-i*.25,width+.54,.32-i*.092,.35,'stone','form')
        self.facade(side,x,.21,-depth+.064,.083,height*.94,.12,'frame','relief')
        if sign:
            self.facade(side,x,height+.37,-.092,width*.94,.40,.13,'brick-dark','form')
            self.label('NANHU CANTEEN',x,height+.47,-.015,width*.9)

    def roof(self, margin=.42, bays=1):
        w,d,h=self.w,self.d,self.h
        self.box(w-2*margin,.20,d-2*margin,0,h-.76,0,'roof',bevel=.16)
        self.box(w-2*margin,.10,d-2*margin,0,h-.52,0,'roof',bevel=.12)
        for sign in (-1,1):
            self.box(w-2*margin,.56,.29,0,h-.56,sign*(d/2-margin),'cap')
            self.box(.29,.56,d-2*margin,sign*(w/2-margin),h-.56,0,'cap')
        for i in range(bays):
            u=(i-(bays-1)/2)*w*.27
            self.box(w*.19,.32,d*.33,u,h-.52,-d*.065,'roof-light',bevel=.14)
            for sign in (-1,1):
                self.box(w*.20,.18,.14,u,h-.31,-d*.065+sign*d*.18,'frame')

    def diagonal(self, side, x1, y1, x2, y2, w, color, offset=-.13):
        nx,nz=base.SIDES[side]
        z=(self.d/2+offset)*nz
        dx,dy=x2-x1,y2-y1
        n=hypot(dx,dy)
        u,v=-dy*w*.5/n,dx*w*.5/n
        outline=[(x1-u,y1-v),(x2-u,y2-v),(x2+u,y2+v),(x1+u,y1+v)]
        vertices=[(x,-(z+t),y) for t in (-.13,.13) for x,y in outline]
        self.parts['form'].append((vertices,[(0,1,2,3),(4,7,6,5),(0,4,5,1),(1,5,6,2),
                                             (2,6,7,3),(3,7,4,0)],base.PALETTE['color'][color]))

    def complex(self):
        w,d,h=self.w,self.d,self.h
        self.podium(.76)
        self.recessed_shell(w-1.12,d-1.18,.75,h*.217,'foundation',7.8,3.43,.22)
        self.box(w-.67,h*.76,d-.89,0,h*.21,0,'stone',bevel=.37)
        # Screen blocks articulate three recesses, while the podium reads continuously.
        self.box(w-.20,.65,d-.20,0,h*.215,0,'cap',bevel=.23)
        for side in ('south','north'):
            for i in (-1,0,1):
                x=i*w*.302
                self.facade(side,x,h*.264,-.39,w*.289,h*.65,.21,'glass-cool','glaze')
            self.storeys(side,35,h*.255,h*.922,8,2,.78)
            for i,drift in [(-.34,.073),(-.10,-.065),(.26,-.06)]:
                self.diagonal(side,w*(i+drift),h*.23,w*i,h*.96,w*.026,'cap')
                self.diagonal(side,w*(i+drift+.020),h*.23,w*(i+.020),h*.96,w*.009,'blue-trim',-.16)
        for side in ('east','west'):
            self.storeys(side,9,h*.27,h*.90,7,4)
            self.facade(side,0,h*.23,-.18,.58,h*.72,.36,'cap','form')
        # The entrance side is taken from the existing node, inside the podium overhang.
        self.gate_portal(7.2,1.17,3.4)
        self.roof(.48,3)

    def canteen(self):
        w,d,h=self.w,self.d,self.h
        self.podium(.42)
        self.recessed_shell(w-1.22,d-1.25,.40,h-.62,'brick',7.2,3.35,.25)
        for side in base.SIDES:
            span=w if side in ('south','north') else d
            count=9 if span==w else 5
            self.storeys(side,count,h*.10,h*.91,3,7,.78)
            for i in range(count+1):
                x=span*.91*(i/count-.5)
                floor=h*.365 if side==self.front and abs(x-self.offset)<3.55 else .39
                self.facade(side,x,floor,-.22,.43,h-.42-floor,.37,'brick-light','form')
            for y in (h*.36,h*.64,h*.92):
                self.facade(side,0,y,-.25,span*.95,.29,.43,'brick-light','form')
        self.gate_portal(6.7,1.06,3.1,True)
        self.roof(.39,2)

    def annex(self):
        w,d,h=self.w,self.d,self.h
        self.podium(.38)
        self.recessed_shell(w-.88,d-.99,.38,h*.76,'stone',w*.43,min(2.70,h*.48),.26)
        self.box(w*.71,h*.26-.055,d*.75,0,h*.74,-d*.06,'brick-dark',bevel=.19)
        self.box(w*.66,.20,d*.73,0,h-.20,-d*.061,'roof')
        for s in (-1,1):
            self.box(w*.13,.23,d*.66,w*.413*s,h*.73,-d*.09,'planted')
            self.box(.23,.28,d*.68,w*.473*s,h*.739,-d*.09,'cap')
        for side in base.SIDES:
            self.storeys(side,7 if side in ('east','west') else 4,h*.14,h*.73,2,4)
        self.gate_portal(w*.39,.98,2.6)

    def hall(self):
        w,d,h=self.w,self.d,self.h
        self.podium(.72)
        self.recessed_shell(w-1.18,d-1.22,.43,h*.82,'stone',6.65,3.48,.32)
        self.box(w-.34,.35,d-.31,0,h*.77,0,'roof-light',bevel=.30)
        self.box(w*.85,h*.19,d*.88,0,h*.81,0,'roof',bevel=.40)
        for i in range(12):
            self.box(.12,.075,d*.83,(i-5.5)*w*.064,h-.078,0,'cap')
        for side in base.SIDES:
            self.storeys(side,8 if side in ('north','south') else 4,h*.21,h*.73,2,3)
            self.facade(side,0,h*.762,-.24,(w if side in ('north','south') else d)*.92,.17,.44,'cap','form')
        self.gate_portal(6.1,1.01,3.4)

    def dorm(self):
        self.residence(self.place['asset'].get('variant','concrete'))

    def service(self):
        self.residence('service')

    def residence(self, kind):
        w,d,h=self.w,self.d,self.h
        brick=kind=='brick'
        main={'brick':'brick','banded':'concrete','concrete':'stone','service':'sand'}[kind]
        self.podium(.45,'foundation')
        self.recessed_shell(w-1.02,d-1.04,.44,h-.51,main,min(w,d)*.42,min(2.91,h*.48))
        for side in base.SIDES:
            span=w if side in ('south','north') else d
            n=max(2,round(span/(2.65 if kind!='service' else 3.1)))
            self.storeys(side,n,h*.137,h*.91,self.floors,len(self.place['id']),.62)
            if side not in (self.front,'south'):continue
            if kind in ('banded','concrete'):
                self.facade(side,-span*.32,.61,-.24,span*.155,h*.87,.39,'cap','form')
            if brick:
                for x in range(n+1):
                    self.facade(side,span*.91*(x/n-.5),.42,-.21,.18,h*.90,.35,'brick-light','form')
            if kind=='banded':
                for r in range(1,min(5,self.floors)):
                    self.facade(side,0,h*r/self.floors,-.20,span*.92,.17,.36,'cap','form')
            if kind=='service':
                self.facade(side,span*.31,.43,-.19,.37,h*.60,.37,'roof-light','form')
        self.gate_portal(min(w,d)*.35,.85,2.8)
        self.roof(.29,1)


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--only')
    options=parser.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
    data=json.loads(base.SCENE_PATH.read_text(encoding='utf-8-sig'))
    nodes={p['id']:p for p in data['nodes']}
    rows=[]
    for place in data['places']:
        if place['h']<=0 or options.only and place['id']!=options.only:
            continue
        game=f"/assets/campus/studio/{place['id']}.glb"
        standard=place['asset']['model']
        styled_place={**place,'asset':{**place['asset'],'model':game}}
        row=base.save_building(styled_place,nodes[place['entry']],base.ROOT/'modeling/studio-source',StudioBuilding)
        rows.append({**row,'standard':standard,'standardSource':f"modeling/source/{place['id']}.blend"})
    if not rows:
        raise ValueError('No matching buildings')
    if not options.only:
        file=base.ROOT/'modeling/studio-manifest.json'
        file.write_text(json.dumps({'blender':base.bpy.app.version_string,'assets':rows},ensure_ascii=False,indent=2)+'\n',
            encoding='utf-8')
    print(f'Exported {len(rows)} studio buildings')


if __name__=='__main__':
    main()
