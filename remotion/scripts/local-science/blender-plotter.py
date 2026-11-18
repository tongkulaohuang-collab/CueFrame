"""Original procedural scene. Local, deterministic, no network or imported assets."""
import bpy, math, json, sys
from pathlib import Path
from mathutils import Vector
args=sys.argv[sys.argv.index('--')+1:]; cfg=json.loads(Path(args[0]).read_text(encoding='utf-8-sig')); out=Path(args[1]);out.mkdir(parents=True,exist_ok=True)
scene=bpy.context.scene;bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
scene.render.engine='BLENDER_EEVEE_NEXT';scene.eevee.taa_render_samples=32
scene.render.resolution_x=cfg['width'];scene.render.resolution_y=cfg['height'];scene.render.resolution_percentage=100;scene.render.fps=cfg['fps']
scene.frame_start=1;scene.frame_end=round(cfg['duration']*cfg['fps']);scene.render.image_settings.file_format='PNG';scene.render.film_transparent=False
scene.world.color=(.08,.08,.08);scene.world.use_nodes=True
world=next(n for n in scene.world.node_tree.nodes if n.type=='BACKGROUND');world.inputs[0].default_value=(.12,.18,.25,1);world.inputs[1].default_value=.35
scene.view_settings.view_transform='AgX';scene.view_settings.look='AgX - Medium High Contrast'
def mat(name,color,metal=0,rough=.4):
 m=bpy.data.materials.new(name);m.use_nodes=True;p=next(n for n in m.node_tree.nodes if n.type=='BSDF_PRINCIPLED');p.inputs['Base Color'].default_value=(*color,1);p.inputs['Metallic'].default_value=metal;p.inputs['Roughness'].default_value=rough;return m
body=mat('Graphite blue anodised aluminium',(.055,.13,.21),.75,.31);edge=mat('Brushed aluminium',(.3,.42,.48),.8,.3);dark=mat('Rubber and recesses',(.014,.024,.035),.05,.6);gold=mat('Warm brass - motion path',(.8,.42,.09),.78,.27);paper=mat('Ivory drafting paper',(.86,.84,.75),0,.8);ink=mat('Blue ink',(.012,.15,.24),0,.6);gridmat=mat('Printed grid',(.43,.55,.56),0,.8);floor=mat('Studio midnight blue',(.022,.043,.065),.1,.5)
def cube(name,loc,size,m,bev=1):
 bpy.ops.mesh.primitive_cube_add(size=1,location=loc);o=bpy.context.object;o.name=name;o.dimensions=size;bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);o.data.materials.append(m)
 if bev:mod=o.modifiers.new('Machined edge','BEVEL');mod.width=bev;mod.segments=3;o.modifiers.new('Weighted normals','WEIGHTED_NORMAL')
 return o
def cyl(name,x,y,z,r,h,m):
 bpy.ops.mesh.primitive_cylinder_add(vertices=48,radius=r,depth=h,location=(x,y,z+h/2));o=bpy.context.object;o.name=name;o.data.materials.append(m);mod=o.modifiers.new('Turned edge','BEVEL');mod.width=min(.6,h/5);mod.segments=3;o.modifiers.new('Weighted normals','WEIGHTED_NORMAL');return o
def line(name,pts,m,r=.35):
 c=bpy.data.curves.new(name,'CURVE');c.dimensions='3D';c.bevel_depth=r;c.bevel_resolution=2;s=c.splines.new('POLY');s.points.add(len(pts)-1)
 for a,b in zip(s.points,pts):a.co=(*b,1)
 o=bpy.data.objects.new(name,c);scene.collection.objects.link(o);c.materials.append(m);return o
def screw(x,y,z,r=2):
 cyl('Hex socket screw',x,y,z,r,1.4,edge);cube('Socket recess',(x,y,z+1.45),(r*1.1,.65,.1),dark,.05)
cube('Studio floor',(0,0,-24),(2500,2500,6),floor,0)
for x in [-166,162]:
 for y in [-69,69]:cyl('Isolation foot',x,y,-21,10,8,dark);cyl('Foot column',x,y,-13,7,5,edge)
cube('Machined instrument base',(-2,0,-4),(364,170,8),body,5)
for x in [-173,169]:
 for y in [-74,74]:screw(x,y,.2)
for x in [-163,-29]:
 cube('Rail saddle',(x,0,5),(10,126,10),body,1)
 cube('Polished rectangular rail',(x,0,13),(4,126,6),edge,.5)
 for y in [-66,66]:cube('Rail end clamp',(x,y,10),(16,10,20),body,1);screw(x,y,20)
cyl('Bearing base',-96,0,0,49,8,dark);cyl('Rotor rim',-96,0,8,44,10,edge);cyl('Rotor face',-96,0,18,41,2,body);cyl('Centre boss',-96,0,20,4,3,edge)
bpy.ops.object.empty_add(location=(-96,0,0));rotor=bpy.context.object;rotor.name='Rotating disc and radial graduations'
for name in ['Rotor rim','Rotor face']:
 o=bpy.data.objects[name];worldmat=o.matrix_world.copy();o.parent=rotor;o.matrix_world=worldmat
for i in range(40):
 a=i*math.tau/40;r=39;o=line('Engraved radial graduation',[(-96+(r-2)*math.cos(a),(r-2)*math.sin(a),20.15),(-96+r*math.cos(a),r*math.sin(a),20.15)],edge,.19);worldmat=o.matrix_world.copy();o.parent=rotor;o.matrix_world=worldmat
cube('Paper bed',(82,0,3),(164,134,6),body,3);cube('Paper',(79.5,0,6.5),(145,118,1),paper,.25)
for y in range(-56,57,8):line('Paper horizontal grid',[(7,y,7.04),(152,y,7.04)],gridmat,.075)
grid=[]
for i in range(20):grid.append(line('Moving paper time grid',[(7,-59,7.06),(7,59,7.06)],gridmat,.075))
for x in [3,156]:
 o=cyl('Paper feed roller',0,0,0,4,124,edge);o.rotation_euler=(math.pi/2,0,0);o.location=(x,0,11)
 for y in [-65,65]:cube('Roller bracket',(x,y,10),(12,8,20),body,1);screw(x,y,20)
cube('Motor enclosure',(-96,62,9),(48,25,18),body,3)
for i in range(6):cube('Motor vent',(-113+i*7,62,18.15),(2,16,.3),dark,.3)
cyl('Feed knob',155,73,0,9,7,edge);cyl('Knob cap',155,73,7,5,2,body)
# Moving carrier has a real horizontal opening around the roller pin.
moving=[]
def mc(name,loc,size,m,bev=1):o=cube(name,loc,size,m,bev);moving.append((o,loc));return o
mc('Slot rear lip',(-96,6.5,25.5),(116,3,5),edge);mc('Slot front lip',(-96,-6.5,25.5),(116,3,5),edge)
for x in [-152,-40]:mc('Slot end wall',(x,0,25.5),(4,16,5),edge)
for x in [-163,-29]:
 mc('Sliding bearing block',(x,0,20),(18,24,8),body,2)
 # Rail intersects the bearing intentionally; this is a guide bearing, not a free solid.
 for dy in [-8,8]:o=cyl('Carriage fastener',x,dy,24,2,1.5,edge);moving.append((o,tuple(o.location)))
mc('Slot bearing left bridge',(-157,0,25),(14,8,5),edge)
mc('Slot bearing right bridge',(-35,0,25),(14,8,5),edge)
mc('Brass pen linkage',(54,0,26),(168,4,4),gold,.8);mc('Rear pen clamp',(137,6,27),(8,8,6),gold,1)
pen=cyl('Exposed pen barrel',137,0,12.1,2.2,20,gold);moving.append((pen,tuple(pen.location)))
cuff=cyl('Pen collar touching rear clamp',137,0,25,2.8,3,edge);moving.append((cuff,tuple(cuff.location)))
bpy.ops.mesh.primitive_cone_add(vertices=32,radius1=.28,radius2=2.2,depth=5,location=(137,0,9.6));tip=bpy.context.object;tip.name='Visible ink nib in paper contact';tip.data.materials.append(ink);moving.append((tip,tuple(tip.location)))
pin=cyl('Eccentric roller pin',-58,0,20,4.5,11,gold)
arm=cube('Rotor crank arm',(-77,0,21),(38,6,2),gold,1)
trace=line('Recorded ink history',[(137,0,7.15)]*260,ink,.28);tracepts=trace.data.splines[0].points
def area(name,loc,energy,size,color,target=(0,0,0)):
 l=bpy.data.lights.new(name,'AREA');l.energy=energy;l.shape='DISK';l.size=size;l.color=color;o=bpy.data.objects.new(name,l);scene.collection.objects.link(o);o.location=loc;o.rotation_euler=(Vector(target)-o.location).to_track_quat('-Z','Y').to_euler()
area('Large soft key',(-200,-160,340),2800000,240,(.83,.91,1));area('Warm rim',(100,230,280),3300000,200,(1,.77,.47));area('Front fill',(220,-180,150),1100000,170,(.66,.83,1))
bpy.ops.object.camera_add();cam=bpy.context.object;cam.data.type='ORTHO';scene.camera=cam;cam.data.lens=52;cam.data.clip_end=3000
def smooth(v):v=max(0,min(1,v));return v*v*(3-2*v)
def mix(a,b,v):return tuple(x+(y-x)*v for x,y in zip(a,b))
def update(sc):
 t=cfg['start']+(sc.frame_current-1)/cfg['fps'];local=t-cfg['start'];a=math.tau*(t+.8)/8;y=38*math.sin(a);x=-96+38*math.cos(a)
 pin.location.x=x;pin.location.y=y;arm.location=(-96+19*math.cos(a),19*math.sin(a),21);arm.rotation_euler.z=a
 rotor.rotation_euler.z=a
 for o,loc in moving:o.location=(loc[0],loc[1]+y,loc[2])
 for i,o in enumerate(grid):gx=7+(i*8-16*t)%152;o.location.x=gx-7;o.hide_render=gx>152
 for i,p in enumerate(tracepts):age=(137-7)/16*(259-i)/259;s=t-age;p.co=(137-16*age,38*math.sin(math.tau*(s+.8)/8),7.2,1)
 v=cfg.get('view','overview');q=smooth(local/cfg['duration'])
 if v=='pin':target=(-96,0,14);pos=mix((-130,-180,290),(-66,-170,310),q);scale=185
 elif v=='slot':target=(-96,0,18);pos=(-96,-210,310);scale=210
 elif v=='pen':
  target=(94,y*.22,8);pos=(125,-215,245);scale=205
  if cfg.get('index')==0:
   f=smooth((local-1.4)/3.1);target=mix((120,y*.35,9),(-2,0,8),f);pos=mix((150,-185,220),(25,-280,410),f);scale=135+310*f
 else:target=(-2,0,8);pos=mix((20,-285,425),(0,-260,445),q);scale=440+20*q
 cam.location=pos;cam.rotation_euler=(Vector(target)-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.ortho_scale=scale
 # Actual keyframes make saved .blend editable without trusted Python handlers.
 if cfg.get('bake',True):
  for o in [pin,arm,cam,*[m[0] for m in moving],*grid]:o.keyframe_insert('location',frame=sc.frame_current)
  arm.keyframe_insert('rotation_euler',frame=sc.frame_current);cam.keyframe_insert('rotation_euler',frame=sc.frame_current);cam.data.keyframe_insert('ortho_scale',frame=sc.frame_current)
  rotor.keyframe_insert('rotation_euler',frame=sc.frame_current)
update(scene)
if '--stills' in args:
 for j,f in enumerate([1,max(1,scene.frame_end//2),scene.frame_end]):scene.frame_set(f);update(scene);scene.render.filepath=str(out/f'proof-{j}.png');bpy.ops.render.render(write_still=True)
else:
 (out/'frames').mkdir(exist_ok=True)
 for f in range(1,scene.frame_end+1):
  scene.frame_set(f);update(scene);scene.render.filepath=str(out/'frames'/f'{f:06d}.png');bpy.ops.render.render(write_still=True)
  if f%24==0:print('PROGRESS',f,scene.frame_end,flush=True)
 # Trace vertices and grid hide state require regeneration; pack source and config for reproducible rerender.
 text=bpy.data.texts.new('RENDER_SOURCE.py');text.write(Path(__file__).read_text(encoding='utf-8'));text=bpy.data.texts.new('SCENE_CONFIG.json');text.write(json.dumps(cfg,ensure_ascii=False,indent=2));bpy.ops.wm.save_as_mainfile(filepath=str(out/'plotter.blend'))
