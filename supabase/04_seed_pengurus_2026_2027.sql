-- SIGAP PMII FEBI — seed susunan pengurus masa khidmat 2026/2027
-- Nama dan jabatan diambil dari daftar susunan pengurus yang diberikan.
-- NIM, angkatan, dan tautan akun sengaja dikosongkan.
-- Dzaky Luqman Abdullah sudah memiliki membership aktif sebagai Kepala Bidang II;
-- title membership tersebut diperbarui dan tidak dibuatkan baris roster kedua.
-- Aman dijalankan ulang: nama yang sudah tercatat pada unit dan periode yang sama dilewati.

begin;

update public.org_units
set name=case code
 when 'papo' then 'PAPO (Pemberdayaan Aparatur Potensi Organisasi)'
 when 'soshum' then 'Soshum (Sosial dan Hubungan Masyarakat)'
 when 'medinfo' then 'Medinfo (Media dan Informasi)'
 when 'hkog' then 'HKOG (Hubungan Komunikasi Organ Gerak)'
 else name end
where code in ('papo','soshum','medinfo','hkog');

update public.memberships m
set position_title='Waka II Bidang Eksternal'
from public.profiles p, public.org_units u, public.evaluation_periods ep
where p.id=m.user_id and u.id=m.unit_id and ep.id=m.period_id
  and p.full_name='Dzaky Luqman Abdullah'
  and u.code='bidang-2-eksternal'
  and ep.name='2026-2027'
  and ep.status='active'::public.period_status
  and m.status='active'::public.membership_status
  and m.role='kepala_bidang'::public.app_role;

with source(full_name,unit_code,position_title) as (
 values
('M. Ilya Nurul Latif','pmii-febi','Ketua Rayon'),
('Wahyu Sekar Arum','sekretaris-umum','Sekretaris'),
('Nabila Dwi Aryani','bendahara-umum','Bendahara'),
('Ahmad Ni’am Azwar Annas','bidang-1-internal','Waka I Bidang Internal'),
('Anisa Dwi Saputri','bidang-1-internal','Sekretaris I Bidang Internal'),
('Fina Amalia','bidang-2-eksternal','Sekretaris II Bidang Eksternal'),
('Fadhila Kamelia Nuha','bidang-3-kajian','Waka III Bidang Kajian'),
('Zahra Nurul Azizah','bidang-3-kajian','Sekretaris III Bidang Kajian'),
('Muhammad Revan Cordova','kaderisasi','Koordinator Biro Kaderisasi'),
('Dafa Khoerul Arrosyid','kaderisasi','Anggota Biro Kaderisasi'),
('Ikhsanul Yakin','kaderisasi','Anggota Biro Kaderisasi'),
('M. Kafka Nafisa Arrozi','kaderisasi','Anggota Biro Kaderisasi'),
('Dina Izzatul Afifah','kaderisasi','Anggota Biro Kaderisasi'),
('Khirani Dwi Azahra','kaderisasi','Anggota Biro Kaderisasi'),
('Fani Rama Anggita','kaderisasi','Anggota Biro Kaderisasi'),
('Nur Khasanah','kaderisasi','Anggota Biro Kaderisasi'),
('Isfiya Maulida','kaderisasi','Anggota Biro Kaderisasi'),
('Wildan Salama','papo','Koordinator Biro PAPO'),
('Rafi Akmal Falih','papo','Anggota Biro PAPO'),
('Muhammad Anwar Baikuni','papo','Anggota Biro PAPO'),
('M Agus Mizan','papo','Anggota Biro PAPO'),
('Muh Bagus Setiawan','papo','Anggota Biro PAPO'),
('Linda Rizqi Setia Winarti','papo','Anggota Biro PAPO'),
('May Muliawati','papo','Anggota Biro PAPO'),
('Lina Nuri Ramadani','entrepreneur','Koordinator Biro Entrepreneur'),
('Aqeela Farhana Rani','entrepreneur','Anggota Biro Entrepreneur'),
('Anis Magfiroh','entrepreneur','Anggota Biro Entrepreneur'),
('Keeva Kamala Syifa','entrepreneur','Anggota Biro Entrepreneur'),
('Alberta Adi Goni','entrepreneur','Anggota Biro Entrepreneur'),
('Rafi Abdillah','entrepreneur','Anggota Biro Entrepreneur'),
('Muhammad Prasetyo Adi','soshum','Koordinator Biro Soshum'),
('Shifa Bunga','soshum','Anggota Biro Soshum'),
('Riska Aulia Ismawati','soshum','Anggota Biro Soshum'),
('Yasmin Ainira Ayustin','soshum','Anggota Biro Soshum'),
('Zia Aura Safira','soshum','Anggota Biro Soshum'),
('Uswatun Khasanah','soshum','Anggota Biro Soshum'),
('Ely Wijayanti','medinfo','Koordinator Biro Medinfo'),
('Nova Khudzwatun Saniah','medinfo','Anggota Biro Medinfo'),
('Zaidaan Amanullah','medinfo','Anggota Biro Medinfo'),
('Yuliana Dwi Hasanah','medinfo','Anggota Biro Medinfo'),
('Iqbal Bayu Utomo','medinfo','Anggota Biro Medinfo'),
('Novan Juliansyah Pratama','medinfo','Anggota Biro Medinfo'),
('Yesy Nur Anggraeni','medinfo','Anggota Biro Medinfo'),
('Muammar Asy Syifa','hkog','Koordinator Biro HKOG'),
('Muhammad Faril Cahyoko','hkog','Anggota Biro HKOG'),
('Dimas Tegar Pramana','hkog','Anggota Biro HKOG'),
('Bagas Muhammad Iqbal','hkog','Anggota Biro HKOG'),
('Salisa Nayla Faiza','hkog','Anggota Biro HKOG'),
('Zalfa Eryna Salsabila','keilmuan','Koordinator Biro Keilmuan'),
('Siti Rifatun Nasikah','keilmuan','Anggota Biro Keilmuan'),
('Inayah Rohmah','keilmuan','Anggota Biro Keilmuan'),
('Lailatul Mufidah','keilmuan','Anggota Biro Keilmuan'),
('Nurfadila Zahrotul Ulya','keilmuan','Anggota Biro Keilmuan'),
('Naila Sofiyatuz Zahroh','keilmuan','Anggota Biro Keilmuan'),
('Muhammad Anto Khoiri Rizal','keilmuan','Anggota Biro Keilmuan'),
('Bagas Putra Febrianto','keilmuan','Anggota Biro Keilmuan'),
('Wahyu Abdul Mukhlis','keagamaan','Koordinator Biro Keagamaan'),
('Fajrian Hidayat','keagamaan','Anggota Biro Keagamaan'),
('Moh Agung Aulia','keagamaan','Anggota Biro Keagamaan'),
('Surya Halwan Nawawi','keagamaan','Anggota Biro Keagamaan'),
('Shania Rahma Widya Putri','keagamaan','Anggota Biro Keagamaan'),
('Lia Yuliana','keagamaan','Anggota Biro Keagamaan'),
('Afifah Agustiani','keagamaan','Anggota Biro Keagamaan'),
('Marsa Shabira','keperempuanan','Koordinator Biro Keperempuanan'),
('Melda Fanesa Fikni','keperempuanan','Anggota Biro Keperempuanan'),
('Saarah Aulia Syawala','keperempuanan','Anggota Biro Keperempuanan'),
('Qonita Melinda Maulida','keperempuanan','Anggota Biro Keperempuanan'),
('Cindy Dwi Astuti','keperempuanan','Anggota Biro Keperempuanan'),
('Devina Dwi Cahyanti','keperempuanan','Anggota Biro Keperempuanan'),
('Nesya Adiha Syafira','keperempuanan','Anggota Biro Keperempuanan'),
('Ranita Ayu Ningtyas','keperempuanan','Anggota Biro Keperempuanan'),
('Ilga Ayu Muslika','keperempuanan','Anggota Biro Keperempuanan')
),
active_period as (
 select id from public.evaluation_periods
 where name='2026-2027' and status='active'::public.period_status
),
admin_actor as (
 select id from public.memberships
 where role='admin'::public.app_role and status='active'::public.membership_status
   and period_id is null
 order by assigned_at asc
 limit 1
),
inserted as (
 insert into public.member_roster
  (period_id,unit_id,full_name,nim,cohort,position_title,linked_user_id,created_by_membership_id,is_active)
 select
  p.id,u.id,s.full_name,null,null,s.position_title,null,a.id,true
 from source s
 cross join active_period p
 cross join admin_actor a
 join public.org_units u on u.code=s.unit_code and u.is_active=true
 where not exists (
   select 1 from public.memberships m
   join public.profiles pr on pr.id=m.user_id
   where m.period_id=p.id and m.unit_id=u.id
     and m.status='active'::public.membership_status
     and lower(trim(pr.full_name))=lower(trim(s.full_name))
 )
 and not exists (
   select 1 from public.member_roster r
   where r.period_id=p.id and r.unit_id=u.id and r.is_active=true
     and lower(trim(r.full_name))=lower(trim(s.full_name))
 )
 returning id
)
select count(*) as inserted_rows from inserted;

commit;
