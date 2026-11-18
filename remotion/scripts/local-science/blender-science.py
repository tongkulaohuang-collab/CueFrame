"""Original bounded educational scenes. All poses depend on global time, never RNG.
No external mesh/texture, no clinical model, no general CFD solver.
"""
import bpy, math, json, sys
from pathlib import Path
from mathutils import Vector
from bpy_extras.object_utils import world_to_camera_view

args=sys.argv[sys.argv.index('--')+1:]
cfg=json.loads(Path(args[0]).read_text(encoding='utf-8-sig'));out=Path(args[1]);out.mkdir(parents=True,exist_ok=True)
scene=bpy.context.scene
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
scene.render.engine='BLENDER_EEVEE_NEXT';scene.eevee.taa_render_samples=16
scene.render.resolution_x=cfg['width'];scene.render.resolution_y=cfg['height'];scene.render.resolution_percentage=100
scene.render.fps=cfg['fps'];scene.frame_start=1;scene.frame_end=round(cfg['duration']*cfg['fps'])
scene.render.image_settings.file_format='PNG';scene.render.film_transparent=False
scene.world.use_nodes=True
scene.world.node_tree.nodes['Background'].inputs[0].default_value=(.028,.05,.075,1)
scene.world.node_tree.nodes['Background'].inputs[1].default_value=.5
scene.view_settings.view_transform='AgX';scene.view_settings.look='AgX - Medium High Contrast'

def mat(name,c,metal=0,rough=.4):
 m=bpy.data.materials.new(name);m.diffuse_color=(*c,1);m.use_nodes=True
 p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*c,1);p.inputs['Metallic'].default_value=metal;p.inputs['Roughness'].default_value=rough
 return m
teal=mat('oxygen-teal',(.025,.65,.51),.22);gold=mat('carbon-dioxide-gold',(.95,.48,.09),.2)
white=mat('ivory',(.8,.88,.85),.1);navy=mat('support',(.07,.16,.23),.2)
red=mat('capillary-blood-dark-red',(.33,.025,.035));cell=mat('red-blood-cell',(.7,.055,.045))
pink=mat('alveolar-wall',(.67,.29,.27),0,.65);lining=mat('alveolar-inner-wall',(.86,.53,.42),0,.6)

def ball(name,loc,r,m,scale=None):
 bpy.ops.mesh.primitive_uv_sphere_add(segments=16,ring_count=8,radius=r,location=loc)
 o=bpy.context.object;o.name=name;o.data.materials.append(m)
 if scale:o.scale=scale
 for p in o.data.polygons:p.use_smooth=True
 return o
def line(name,pts,m,r=.025):
 c=bpy.data.curves.new(name,'CURVE');c.dimensions='3D';c.bevel_depth=r;c.bevel_resolution=2
 s=c.splines.new('POLY');s.points.add(len(pts)-1)
 for p,xyz in zip(s.points,pts):p.co=(*xyz,1)
 o=bpy.data.objects.new(name,c);scene.collection.objects.link(o);c.materials.append(m);return o
def surface(name,vertices,faces,m):
 mesh=bpy.data.meshes.new(name);mesh.from_pydata(vertices,[],faces);mesh.update()
 o=bpy.data.objects.new(name,mesh);scene.collection.objects.link(o);o.data.materials.append(m)
 for p in mesh.polygons:p.use_smooth=True
 return o
def shell(name,center,r,m):
 # Remove the front half to expose the alveolar lumen, with an open airway above.
 verts=[];faces=[];nt=40;np=22
 for i in range(np+1):
  phi=.32+(math.pi-.32)*i/np
  for j in range(nt+1):
   th=math.pi*j/nt
   verts.append((center[0]+r*math.sin(phi)*math.cos(th),center[1]+r*math.sin(phi)*math.sin(th),center[2]+r*math.cos(phi)))
 for i in range(np):
  for j in range(nt):a=i*(nt+1)+j;faces.append((a,a+1,a+nt+2,a+nt+1))
 return surface(name,verts,faces,m)
def tube(name,pts,r,m):return line(name,pts,m,r)
def area(name,loc,power,size,target):
 d=bpy.data.lights.new(name,'AREA');d.energy=power;d.shape='DISK';d.size=size
 o=bpy.data.objects.new(name,d);scene.collection.objects.link(o);o.location=loc;o.rotation_euler=(Vector(target)-o.location).to_track_quat('-Z','Y').to_euler()
area('Key',(1,-6,8),900,7,(0,0,0));area('Rim',(-5,4,6),1100,6,(0,0,0));area('Fill',(5,-1,1),500,5,(0,0,0))
bpy.ops.object.camera_add();camera=bpy.context.object;camera.name='Scientific observation camera';camera.data.type='ORTHO';scene.camera=camera
template=cfg['template'];parameters=cfg.get('parameters',{});moving=[];details={}
aspect=cfg['width']/cfg['height']

if template=='cubic-lattice':
 n=parameters['layers'];d=1.25;mid=(n-1)/2;positions={}
 for i in range(n):
  for j in range(n):
   for k in range(n):
    pos=((i-mid)*d,(j-mid)*d,(k-mid)*d);positions[(i,j,k)]=pos
    ball('lattice-site-%d-%d-%d'%(i,j,k),pos,.12,gold if j==n//2 else teal)
 for key,p in positions.items():
  for axis in range(3):
   q=list(key);q[axis]+=1
   if tuple(q) in positions:line('neighbor-'+str(key)+'-'+str(axis),[p,positions[tuple(q)]],white,.017)
 details={'nodes':n**3,'nearestNeighborSpacing':d,'bondsAre':'adjacency guides, not chemical bonds'}
elif template=='alveolar-exchange':
 center=(-1.15,0,0);radius=1.55
 shell('alveolar-cutaway',center,radius,pink);shell('alveolar-lumen',center,radius-.06,lining)
 # The same airway joins the open top of the cutaway.
 tube('airway-left',[(-1.62,0,1.46),(-1.62,0,2.18)],.08,pink)
 tube('airway-right',[(-.68,0,1.46),(-.68,0,2.18)],.08,pink)
 pts=[(.79+.22*math.cos(i*math.pi/36),.32,-2.1+4.2*i/36) for i in range(37)]
 tube('pulmonary-capillary',pts,.29,red)
 for i in range(7):moving.append(('blood',i,ball('blood-cell-'+str(i),(0,0,0),.2,cell,(1,.55,1))))
 for kind,m,z in [('oxygen',teal,.46),('carbon-dioxide',gold,-.46)]:
  for i in range(5):moving.append((kind,i,ball(kind+'-'+str(i),(0,0,0),.085,m)))
 # Membrane contact is a visible thin interface, separate from blood and lumen.
 line('exchange-membrane',[(.40,-.04,-.95),(.40,-.04,.95)],white,.025)
 details={'oxygenNetDirection':'alveolar lumen to capillary blood','carbonDioxideNetDirection':'capillary blood to alveolar lumen','scale':'schematic, not to scale','geometry':'single cutaway alveolus and adjacent capillary; not whole-lung anatomy'}
else:
 radius=parameters['radius'];mean=parameters['meanSpeed'];nu=parameters['viscosity'];L=radius*24
 # One open longitudinal cut exposes the same cylindrical wall and particle paths.
 verts=[];faces=[];segments=36
 for x in [-3.9,3.9]:
  for i in range(segments+1):
   angle=math.pi*i/segments;verts.append((x,math.sin(angle),math.cos(angle)))
 for i in range(segments):faces.append((i,i+1,i+segments+2,i+segments+1))
 surface('open-pipe-wall',verts,faces,navy)
 for x in [-3.9,3.9]:line('wall-rim',[(x,math.sin(i*math.pi/36),math.cos(i*math.pi/36)) for i in range(37)],white,.025)
 for ri in [0,.35,.68,.9]:
  angles=[0] if ri==0 else [0,math.pi/2,math.pi,3*math.pi/2]
  for ai,a in enumerate(angles):
   y=ri*math.sin(a);z=ri*math.cos(a)
   line('streamline',[(x,y,z) for x in [-3.9,3.9]],navy,.009)
   for i in range(4):moving.append(('fluid',(ri,ai,i,y,z),ball('tracer-%.2f-%d-%d'%(ri,ai,i),(0,0,0),.045,gold if ri==0 else teal)))
 # Velocity profile uses the very same speed equation as the particles.
 line('parabolic-velocity-profile',[(1.4+1.5*(1-(i/30)**2),-.05,i/30) for i in range(-30,31)],gold,.025)
 details={'radius_m':radius,'meanSpeed_m_s':mean,'kinematicViscosity_m2_s':nu,'Re':2*radius*mean/nu,'Q_m3_s':math.pi*radius**2*mean,'u':'2*U*(1-(r/R)^2)','model':'analytic Hagen-Poiseuille solution; not a CFD simulation','visualTimeScale':1,'particles':'passive tracers, not molecules'}

bpy.context.view_layer.update()
static_bounds=[o.matrix_world@Vector(corner) for o in scene.objects if o.type in ['MESH','CURVE'] and not o.name.startswith(('oxygen-','carbon-dioxide-','blood-cell-','tracer-')) for corner in o.bound_box]
def set_camera(t):
 section=cfg['view']=='section'
 if template=='cubic-lattice':
  a=.52+.2*math.sin(t*.22);pos=(8*math.sin(a),-8*math.cos(a),4.4);target=(0,0,0);span=parameters['layers']*1.25+1.8
 elif template=='alveolar-exchange':pos=(.25,-10,3.1);target=(-.5,0,.05);span=5.6 if not section else 3.8
 else:pos=(.5,-10,3.4);target=(0,0,0);span=9.7 if not section else 7.7
 camera.location=pos;camera.rotation_euler=(Vector(target)-camera.location).to_track_quat('-Z','Y').to_euler()
 # Blender ortho_scale is horizontal at landscape; keep all subjects in portrait too.
 camera.data.ortho_scale=span
 camera.data.shift_y=-.045
 bpy.context.view_layer.update()
 if not section:
  projected=[world_to_camera_view(scene,camera,p) for p in static_bounds]
  ratio=max(max(abs(p.x-.5)/.42 for p in projected),max(abs(p.y-.55)/.32 for p in projected))
  camera.data.ortho_scale*=max(1,ratio*1.04)

def update(frame,bake=False):
 t=cfg['start']+(frame-1)/cfg['fps'];set_camera(t)
 for kind,i,o in moving:
  if kind=='blood':
   z=-2.1+((t*.65+i*.6)%4.2);o.location=(.79+.22*math.cos((z+2.1)/4.2*math.pi),.07,z)
  elif kind in ['oxygen','carbon-dioxide']:
   q=(t*.24+i/5)%1;xx=-.55+1.48*q
   if kind=='carbon-dioxide':xx=.93-1.48*q
   o.location=(xx,-.18,(.46 if kind=='oxygen' else -.46)+.025*math.sin(q*math.tau))
  else:
   ri,ai,idx,y,z=i;v=2*mean*(1-ri*ri);x=((t*v+idx*L/4+ai*.07*L)%L)/L*7.8-3.9;o.location=(x,y,z)
  if bake:o.keyframe_insert('location',frame=frame)
 if bake:
  camera.keyframe_insert('location',frame=frame);camera.keyframe_insert('rotation_euler',frame=frame)
  camera.data.keyframe_insert('ortho_scale',frame=frame)

# Bake every frame once, so .blend is editable and rerenders without executing handlers.
for frame in range(1,scene.frame_end+1):update(frame,True)
for action in bpy.data.actions:
 try:
  for curve in action.fcurves:
   for k in curve.keyframe_points:k.interpolation='LINEAR'
 except AttributeError:pass
scene.frame_set(1)
for name,body in [('SCENE_CONFIG.json',json.dumps(cfg,ensure_ascii=False,indent=2)),('SCIENCE_SCOPE.json',json.dumps(details,ensure_ascii=False,indent=2)),('RENDER_SOURCE.py',Path(__file__).read_text(encoding='utf-8'))]:
 bpy.data.texts.new(name).write(body)
bpy.ops.wm.save_as_mainfile(filepath=str(out/(template+'.blend')))
(out/'geometry.json').write_text(json.dumps({'template':template,'objects':len(scene.objects),'frames':scene.frame_end,**details},ensure_ascii=False,indent=2),encoding='utf-8')
if '--stills' in args:
 for j,f in enumerate([1,max(1,scene.frame_end//2),scene.frame_end]):
  scene.frame_set(f);scene.render.filepath=str(out/f'proof-{j}.png');bpy.ops.render.render(write_still=True)
else:
 (out/'frames').mkdir(exist_ok=True)
 scene.render.filepath=str(out/'frames')+'/'
 for f in range(1,scene.frame_end+1):
  scene.frame_set(f);scene.render.filepath=str(out/'frames'/f'{f:06d}.png');bpy.ops.render.render(write_still=True)
  if f%24==0:print('PROGRESS',f,scene.frame_end,flush=True)
