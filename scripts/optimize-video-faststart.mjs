import {readFile,rename,writeFile} from 'node:fs/promises';
import {basename} from 'node:path';

function atoms(buffer){
 const result=[];let offset=0;
 while(offset+8<=buffer.length){let size=buffer.readUInt32BE(offset),header=8;if(size===1){size=Number(buffer.readBigUInt64BE(offset+8));header=16;}else if(size===0)size=buffer.length-offset;if(!Number.isSafeInteger(size)||size<header||offset+size>buffer.length)throw new Error(`Invalid MP4 atom at byte ${offset}`);result.push({type:buffer.toString('ascii',offset+4,offset+8),offset,size});offset+=size;}
 if(offset!==buffer.length)throw new Error(`Invalid trailing MP4 data at byte ${offset}`);return result;
}

function relocateChunkOffsets(moov,delta){
 for(let offset=4;offset+12<=moov.length;offset++){
  const type=moov.toString('ascii',offset,offset+4);if(type!=='stco'&&type!=='co64')continue;
  const atomStart=offset-4,size=moov.readUInt32BE(atomStart),count=moov.readUInt32BE(offset+8),width=type==='stco'?4:8,entries=offset+12;
  if(size<16||atomStart+size>moov.length||entries+count*width>atomStart+size)continue;
  for(let index=0;index<count;index++){const position=entries+index*width;if(width===4){const next=moov.readUInt32BE(position)+delta;if(next>0xffffffff)throw new Error('32-bit MP4 chunk offset overflow');moov.writeUInt32BE(next,position);}else moov.writeBigUInt64BE(moov.readBigUInt64BE(position)+BigInt(delta),position);}
  offset=atomStart+size-1;
 }
}

async function optimize(path){
 const source=await readFile(path),top=atoms(source),moov=top.find(atom=>atom.type==='moov'),mdat=top.find(atom=>atom.type==='mdat');
 if(!moov||!mdat)throw new Error(`${basename(path)} is missing moov or mdat`);
 if(moov.offset<mdat.offset){console.log(`${basename(path)} already supports fast start`);return;}
 const movie=Buffer.from(source.subarray(moov.offset,moov.offset+moov.size));relocateChunkOffsets(movie,moov.size);
 const before=source.subarray(0,mdat.offset),media=source.subarray(mdat.offset,moov.offset),after=source.subarray(moov.offset+moov.size),target=`${path}.faststart.tmp`;
 await writeFile(target,Buffer.concat([before,movie,media,after]));await rename(target,path);console.log(`${basename(path)} optimized (${moov.size} metadata bytes moved to the front)`);
}

const paths=process.argv.slice(2);if(!paths.length)throw new Error('Pass one or more MP4 paths');
for(const path of paths)await optimize(path);
