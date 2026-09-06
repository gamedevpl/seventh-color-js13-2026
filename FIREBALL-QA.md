# Unicorn Fireball — QA F31, 2026-09-06

Poświata refleksu .18 → .25. Tangencjalne zawirowania przy biegnących
unicornach, większy obszar dla tęcz. Eksplozje najpierw odsuwają brokat
radialnie; pozostałe przesunięcie obraca się i zanika. Najsilniejszy lokalny
wpływ wygrywa, bez sumowania nieograniczonych sił. Dystans uwzględnia wysokość.
To efekt wizualny na istniejącym polu, nie symulacja płynu.

Testy brokatu PASS: refleks, poświata, małe płatki przy kamerze, bufor,
opad, recykling, pełny cykl grup aktualizacji, tangencjalny wir od kopyt,
radialny impuls eksplozji i obrotowy zanik. Kopyta nie ruszają brokatu na wysokości 50
jednostek świata. Kod refleksu zgodny z workbenchem.

Chrome / Apple M4 / ANGLE Metal: zero błędów JS, shader linked, mediana
16,7 ms, p95 17,6 ms podczas nagrywania przejazdu tęcz i eksplozji.
Media: .cache/f31. Workbench zyskał przycisk Eksplozja.

Kompresja O2 ×5: 13 227, 13 228, 13 237, 13 234, 13 225 — guard PASS.
Finalny ZIP: **13 225 / 13 312**, zapas **87**.
`fireball:verify` PASS (3 uruchomienia). Produkcyjny Chrome / Apple M4:
shader, desktop/pion/poziom i start dotykiem PASS, zero błędów JS. HTML ZIP/build/play oraz
.cache/minimap/without-map.html identyczny. Workbench: A/B, pauza, obrót,
podrywanie i eksplozja przeszły test Chrome GPU bez błędów JS/GL.
SHA-256: `b5b1c07f7bfc3dfac812028ff68edcee2a8c816a2a01fa86baeda8db3d804f74`.

## Poprzednia runda — F30

Minimapa usunięta; lista band, liczebności, oznaczenia graczy online i serca
przesunięte razem o 82 piksele logiczne w prawo. Margines kolorowego punktu
od prawej krawędzi: 12 pikseli. Bez nowych wskaźników kierunku.

Pojedynczy build O2: **13 159 / 13 312 B**, zapas **153**. HTML w ZIP i play
identyczny. To pojedynczy pomiar, nie pięciopróbowy guard.
Chrome GPU: obejrzany HUD 1280×720, dopasowanie pion/poziom telefonu PASS,
zero błędów JS. Screenshot: .cache/minimap/aligned.png.

## Poprzednia runda — F29

Wariant zatwierdzony w workbenchu przeniesiony do gry z domyślną siłą 8.
Kolorowe drobinki, nieregularny punktowy refleks i słaba poświata; brak
ramion gwiazdek. Wspólny kod rysowania punktu i poświaty oszczędza miejsce.

Test brokatu PASS: zgodność z workbenchem, krótki biały refleks, słabsza
poświata, kolor poza błyskiem, wielkość przy kamerze, bufor, podrywanie,
opad i recykling. Pole i liczba drobinek bez zmian.

Chrome / Apple M4 / ANGLE Metal: mediana 16,7 ms, p95 17,6 ms podczas
nagrywania gry, brak błędów JS, shader linked. Media w .cache/f30.

5 prób O2 przed zmianą viewport: 13 327, 13 327, 13 339, 13 323, 13 322
— guard FAIL. Czas cząstek odczytywany raz na klatkę. Viewport Fireball
zostawia width=device-width, pomija jawne initial-scale=1; inne gry bez zmian.
Po ponownym pakowaniu Zopfli: **13 309 / 13 312**, zapas 3.
Finalny HTML ZIP/build/play identyczny. Świeży build może przekroczyć limit.
`fireball:verify` PASS (3 uruchomienia). Produkcyjny Chrome / Apple M4:
shader, desktop/pion/poziom i start dotykiem PASS, zero błędów JS.
SHA-256: `4240293f9bc9b3d848ce2a5a46a48d77264b2a239387ec995c0633490e5f3390`.

## Poprzednia runda — F28

Przywrócony kolorowy brokat z łagodnym połyskiem; co szesnasta drobinka może
krótko rozbłysnąć białą, czteroramienną gwiazdką. Zwykłe drobinki zachowują
rozmiar. Promienie refleksu ogranicza ta sama odległość od kamery; maksimum
.2 jednostki świata. Bez nowych draw calli, istniejący bufor mieści promienie.

Testy brokatu: kolor zwykłej drobinki, biały refleks, promień gwiazdki,
wygaszenie w 350 ms, recykling, opad, podrywanie, bufor i wielkość przy kamerze.
Chrome / Apple M4 / ANGLE Metal: brak błędów JS, shader linked, mediana
16,7 ms, p95 17,4 ms przy nagrywaniu. Obejrzano mniej białych refleksów na
kolorowym tle. Media: .cache/f28.

Paczka: 5 prób O2 przed uproszczeniem CSS: 13 325, 13 316, 13 320,
13 326, 13 314 — guard FAIL. Zopfli: 13 313. Usunięty powtórzony selektor
body przy touch-action/overscroll-behavior (pozostaje root html; inne gry
bez zmian), ponowne pakowanie: **13 309 / 13 312**, zapas 3.
Finalny HTML ZIP/build/play identyczny. Świeży build może przekroczyć limit.
`fireball:verify` PASS (3 uruchomienia); produkcyjny Chrome / Apple M4:
shader, desktop/pion/poziom i start dotykiem PASS, zero błędów JS.
SHA-256: `c7a1a1fb9522dff2022fb536789a9ebe45f1365b73b98a05c9a05a11f8a88463`.

## Poprzednia runda — F27

Krótsze, jaśniejsze refleksy brokatu: potęga 64 zamiast 16, biały szczyt,
niższa poświata między błyskami. Geometria, limit wielkości przy kamerze,
9216 drobinek, opadanie i podrywanie bez zmian.

Test brokatu obejmuje biały szczyt i spadek jasności poniżej 5% po 200 ms,
obrót względem kamery, limit rozmiaru, wysoki opad, recykling i podrywanie.
Chrome / Apple M4 / ANGLE Metal: shader linked, zero błędów JS, mediana
16,7 ms, p95 17,2 ms podczas nagrywania. Media w .cache/f27.

Paczka O2 ×5: 13 301, 13 280, 13 290, 13 295, 13 284 — guard PASS.
Wybrany ZIP **13 280 / 13 312**, zapas 32; HTML w ZIP i play identyczny.
`fireball:verify` PASS (3 uruchomienia), produkcyjny shader GPU, układy
desktop/pion/poziom i start dotykiem PASS, zero błędów JS.
SHA-256: `04fb185d51802b3ca980eb77cf0be83ffabbdac5dd211122814e569b83e5f21f`.

## Poprzednia runda — F26

## Rekrutacja i decyzje AI

Większy obszar priorytetu zbierania (28 → 45), ignorowanie oszołomionych
jednostek, hamowanie przy ciasnym skręcie podczas zbierania. Polowanie od
8 zamiast 3 followersów (po 90 s możliwa desperacka walka), preferencja
osłabionych rywali i brak mnożnika faworyzującego atak na człowieka.
Dobrowolny atak najwyżej na 1,2× własnego stada; unik przed nadlatującą tęczą
powyżej 1,6×, również blisko. Bez dodatkowych jednostek, życia i obrażeń AI.

Test decyzji: odległy neutralny, pomijanie daze, wybór rannego przeciwnika,
unikanie przewagi liczebnej i bliski unik — PASS. Sześć izolowanych układów
rekrutów: każde AI zebrało 20+ w 45 s. 23 regresje reguł gry PASS.

24 identyczne seedy, wszyscy gracze sterowani przez AI, limit 420 s:

| Miara | Przed | Po |
| --- | ---: | ---: |
| Bandy osiągające 20+ | 42 | 55 |
| Mecze z bandą 30+ | 23/24 | 24/24 |
| Szarże z <5 followersów | 10 | 1 |
| Mediana pierwszego 20+ | 50,5 s | 51,5 s |
| Mediana długości meczu | 91,5 s | 128 s |
| Rozstrzygnięte mecze | 24/24 | 24/24 |
| Upadki liderów za arenę | 1 | 2 |

Pierwszy wynik 20+ nie pojawia się szybciej, lecz więcej band go osiąga.
Dłuższe rundy są kompromisem ostrożniejszej walki. To nie jest test win-rate
człowieka. Wyniki w .cache/f26/{before24,final}.json; powtarzalny harness
`node tools/bench-fireball-ai.mjs`. Początkowe zbyt pasywne warianty odrzucono.

## Paczka F26

Kompresja O2 ×5: 13 267, 13 268, 13 293, 13 296, 13 271 — guard PASS.
Finalny ZIP: **13 267 / 13 312**, zapas **45**. HTML w ZIP i play identyczny.
`fireball:verify` PASS (3 uruchomienia). Produkcyjny Chrome / Apple M4 /
ANGLE Metal: shader, desktop/pion/poziom i start dotykiem PASS, zero błędów JS.
SHA-256 ZIP: `a7ec52e30906fed363fef537b95883d8715125a1d4e33e0063814b58d745e539`.

## Poprzednia runda — F25

## Dźwięk i kształt tęczy

Zderzenia rogów i ciał używają krótszego, łagodniejszego uderzenia w oktawie A.
Ładowanie ma rosnące dzwonki pentatoniczne; kończą się przy zapłonie.
Własna szarża przyspiesza istniejącą melodię z 132 do 155,76 BPM, wzmacnia
stopę, bas i melodię oktawową. Odległe tęcze zachowują tłumienie i panoramę.

Łuk tęczy podniesiono (.85 → 1.1), a stary ogon stopniowo zwężono zgodnie
z wiekiem próbek. Czubek pozostaje przy liderze. Pozycje jednostek bez zmian.
Oszczędności: płaskie przyciemnienie ekranu tytułowego, usunięty rok ze stopki,
wspólny bufor szumu o stałej długości i usunięte powtórzone touch-action z HUD
(gesty blokuje już nadrzędny body/html).

## Sprawdzenie

23 testy reguł gry PASS. Testy ładowania, tempa, melodii, geometrii łuku,
cieni i plazmy PASS. Miks offline: peak 0,54087, zero obciętych próbek,
RMS 0,05679 przy aktywnej tęczy, eksplozji i wielu zderzeniach.
Sześciosekundowy odsłuch przejścia jazda/ładowanie/tęcza: peak 0,39758,
zero przesterowania. Ocena charakteru brzmienia pozostaje subiektywna.

Chrome / Apple M4 / ANGLE Metal: mediana 16,7 ms, p95 17,4 ms (119 klatek
z nagrywaniem), zero błędów JS, shader linked. Obejrzano boczny profil,
zakręt, trzy tęcze i wypalenie. Media w .cache/f25. Brak testu na fizycznym telefonie.

## Paczka F25

Pięć kompresji O2: 13 307, 13 314, 13 322, 13 316, 13 308.
Guard worst-of-five FAIL; wybrany ZIP **13 307 / 13 312**, zapas **5**.
Zopfli 1000 nie zmniejszył go dalej. Świeży build może przekroczyć limit.
HTML w ZIP-ie, build i play identyczny. `fireball:verify` PASS (trzy
uruchomienia ZIP). Produkcyjny Chrome / Apple M4: shader, rozmiary
desktop/pion/poziom i start dotykiem PASS, zero błędów JS.
SHA-256 ZIP: `564ef02079452596e61099bfbe791a682e7ded998e7dbd0193c77ecac2a03798`.

## Poprzednia runda — F24

## Brokat od nieba po ziemię

9216 drobinek zamiast 900. Zapętlone opadanie od wysokości około 64 jednostek,
z wyhamowaniem przy podłożu i ponownym wejściem z góry; zwykła kamera nie widzi
górnej płaszczyzny emisji. To recyklingowane pole 84×84 wokół obserwowanej bandy,
nie nieskończona fizyczna symulacja. Zachowano ograniczenie do granic areny.

Rozmiar bazowy ograniczony do .025, dodatkowo maleje proporcjonalnie do
poziomego dystansu od kamery (współczynnik .001). Bliskie płatki nie wyrastają
w duże romby. Dziewięć tysięcy drobinek ma osiem przeplatanych grup aktualizacji
podrywania (około 133 ms przy 60 FPS); ruch i błyski aktualizują się co klatkę.

## Sprawdzenie

Test brokatu: 9436 miejsc łącznie z iskrami, recykling, bufor, opadanie,
podrywanie, refleks, pełen ośmioklatkowy cykl grup, limit wielkości przy kamerze
oraz drobinki powyżej 50 jednostek — PASS. Workload obejmuje 600 kroków.

Chrome / Apple M4 / ANGLE Metal, 119 klatek z nagrywaniem: mediana 16,7 ms,
p95 17,6 ms, zero błędów JS, shader linked. Obejrzano niebo i horyzont po
wypaleniu tęcz; zapisano screenshot i film w .cache/f24. Film jest bez audio.
Nie przeprowadzono pomiaru na fizycznym telefonie.

Tytuł strony przeniesiony do JS, aby współdzielić tekst z HUD-em. Pozostałe
wpisy zachowują tytuł HTML. before/append zastępują dłuższe odpowiedniki DOM.
Nie zachowano eksperymentu z aliasami Math, bo pogarszał kompresję.

## Paczka F24

Finalny ZIP: `fireball:verify` PASS (trzy uruchomienia). Produkcyjny HTML
przeszedł shader na GPU, desktop/pion/poziom i start dotykiem bez błędów JS.
Test opcjonalnego tytułu oraz deklaracji UTF-8 w shellu również PASS.

Pięć kompresji O2: 13 334, 13 313, 13 345, 13 318, 13 330 — guard FAIL.
Wybrany HTML ponownie spakowano Zopfli 1000: **13 313 → 13 310 bajtów**,
bez zmiany skryptu. Finalny ZIP: **13 310 / 13 312**, zapas **2**.
Polecenie `node tools/refine-fireball.mjs` odtwarza dodatkowy etap.
Świeża kompresja Roadroller nie gwarantuje zmieszczenia się w limicie.
HTML w ZIP-ie, build i play jest identyczny.

SHA-256 ZIP: `0774969825bbc3d5af4b4fc31449ffb4a5b56a579c0086cf8b4712ad26fa418a`.

## Poprzednia runda — F23

# Unicorn Fireball — QA F23, 2026-09-06

## Gęstszy brokat i spokojniejszy miks

900 zamiast 400 drobnych płatków. Zachowano obrót, kierunkowy refleks,
opadanie i podrywanie przez unicorny/tęcze, bez zwiększania rozmiaru płatków.
Pula ma osobne 220 miejsc na iskry walki.

Gain warstwy tęczy .13 → .04 (−10,2 dB), czas nuty .30 → .22 s.
Usunięto oddzielną fanfarę zapłonu, która nakładała się przy kilku bandach.
Wspólny StereoPanner warstwy tęczy uwzględnia położenia band względem kamery,
zanik do 70 jednostek i wygładzenie 100 ms. Kierunki sumowane z wagami;
normalizacja przez 2+suma wag utrzymuje pan w zakresie przy siedmiu bandach.
To wspólna panorama stereo, nie siedem niezależnych źródeł 3D. Muzyka bazowa
pozostaje pośrodku. Najgłośniejsze tęcze nie zwiększają gain powyżej .04.

## Testy

Brokat: podrywanie, powrót, recykling 1120 miejsc, odbicia i brak przepełnienia
bufora PASS. Testy cieni, łuków i kanału lightning PASS. Motyw melodii,
dystans, kierunek panoramy i siedem nakładających się źródeł PASS.

Offline stereo, stała scena z heat=.8, dwusekundowy fragment: RMS samej muzyki
0,01894, z tęczą 0,01973 — wzrost o 4,2%. To kontrolowany pomiar, nie gwarancja
percepcyjnej głośności na każdych głośnikach. Izolowana warstwa przy pan ±.8:
RMS bliższego kanału 0,006259, dalszego 0,001158. Stress miks: peak 0,7746,
zero przesterowanych próbek. Test utrwalony w test-fireball-stereo.mjs.

Chrome / Apple M4 / ANGLE Metal: zero błędów JS, shader linked, 900 płatków,
trzy tęcze i wypalenie. Z nagrywaniem: mediana 16,7 ms, p95 17,1 ms,
119 próbek. Nie jest to pomiar na fizycznym telefonie.

Oszczędności: domyślne ratio kompresora 12:1, algebraicznie równoważny shader
solid/glow przy trybach 0/1, usunięty redundantny clamp brokatu, inset w HUD
oraz krótszy komunikat chłodzenia (sterowanie hamowaniem nadal opisane).

## Paczka F23

Wybrany ZIP: `fireball:verify` PASS (trzy uruchomienia); produkcyjny HTML
przeszedł też test shadera na GPU, desktop/pion/poziom i start dotykiem.

Wybrany ZIP **13 309 / 13 312 bajtów**, zapas **3**. Próby O2:
13 316, 13 312, 13 309, 13 321, 13 311. Wybrana paczka spełnia limit;
guard worst-of-five nadal zwraca FAIL. Nowy pojedynczy build może go przekroczyć.
HTML w ZIP-ie i play/unicorn-fireball.html są identyczne.

SHA-256 ZIP: `b61d1e0a13b7358f1b08701e957f5c3d120ed0141b8468e077bc616145fbb6d5`.

## Poprzednia runda — F22

# Unicorn Fireball — QA F22, 2026-09-06

## Workbench i port do gry

Osobny workbench WebGL: `npm run fireball:lightning`, wynik
`build/lightning-workbench/index.html`. Pauza, inny kanał, regulacja odstępu
błysków oraz zatrzymany podgląd na dwóch unicornach. Workbench i gra importują
ten sam moduł `fireball/src/lightning.js`; narzędzie nie wchodzi do ZIP-a.

Kanał ma 12 nieregularnych segmentów, biały rdzeń, niebieską poświatę i trzy
cienkie odnogi. Geometria pozostaje stała podczas 150 ms życia wyładowania;
zmienia się jasność kolejnych błysków. Usunięto losowanie kształtu co klatkę
oraz dodatkową dekoracyjną iskrę. To stylizacja pioruna, nie symulacja plazmy.
Punkty końcowe są próbkowane przy powstaniu, nie podążają za unicornami przez
te 150 ms. Nie ma przyciągania wyładowań nad stado.

## Testy

23 testy reguł PASS. Testy brokatu, kierunkowego refleksu, cieni, końców
ładowania i grupowania trafień PASS. Nowy test modułu lightning: stałość
geometrii, zmiana jasności bez zmiany kanału, końce, wygaśnięcie oraz
60 jednoczesnych kanałów mieszczących się w powiększonym buforze — PASS.

Workbench i gra w Chrome / Apple M4 / ANGLE Metal: zero błędów JS.
Podgląd zatrzymany obejrzano na unicornach. Gra: zakręt, trzy tęcze i wypalenie;
119 próbek z nagrywaniem, mediana 16,7 ms, p95 18,4 ms.

## Paczka F22

Wybrana paczka: `fireball:verify` PASS (trzy uruchomienia), a produkcyjny
HTML przeszedł również shader na GPU, desktop/pion/poziom i start dotykiem.
Zero błędów JS; rozmiary telefonu emulowane, bez fizycznego urządzenia.

Wybrany ZIP **13 305 / 13 312 bajtów**, zapas **7**.
Pięć kompresji O2: 13 305, 13 331, 13 306, 13 319, 13 331.
Dwie mieszczą się w limicie. Guard worst-of-five zwrócił FAIL, mimo że
zapisany najlepszy ZIP spełnia limit. Pojedynczy nowy build może go przekroczyć.
HTML w wybranym ZIP-ie i play/unicorn-fireball.html są identyczne.

SHA-256 ZIP: `752a98fa7885df6024414a76b0486cd43926289b20e9565b2f43d70eb9e96630`.

## Poprzednia runda — F21

# Unicorn Fireball — QA F21, 2026-09-06

## Brokat i melodia tęczy

400 płatków zamiast prototypowych 196, rozmiar bazowy .035 zamiast .07.
Obracają się wokół osi pionowej; projekcja płatka i wąski błysk zależą od
kąta względem kamery. Efekt odbicia jest stylizowany, bez ray tracingu.
Drobinki opadają, okresowo wracają w powietrze, podrywają się pod kopytami
i wirują mocniej po przejeździe tęczy. Pula recyklinguje pole 84×84 wokół
obserwowanej bandy, pomijając pozycje poza areną; 220 miejsc na iskry walki
pozostaje osobne. Nie dodano losowań do symulacji ani nowego draw calla.

Usunięto ciągły sawtooth riser. Główny motyw otrzymał warstwę triangle oktawę
wyżej, zsynchronizowaną z muzyką i reagującą na pobliskie ładowania/tęcze
wszystkich band, z zanikiem do 70 jednostek. Najsilniejsze źródło ustala gain
jednej wspólnej warstwy, więc kilka tęcz nie mnoży melodii. Zapłon gra fragment
motywu zamiast ZIIIING. To nie jest osobny przestrzenny kanał każdej bandy.

## Testy

- 23 testy reguł PASS; testy łuków, cieni i grupowania trafień PASS.
- Nowy test brokatu: podrywanie, większy zasięg tęczy, opadanie, 600 kroków
  recyklingu, brak NaN i przekroczenia bufora; obrót kamery gasi refleks — PASS.
- Nowy test melodii: motyw oktawę wyżej, pobliska tęcza rywala, zanik z dystansem
  i słabsza warstwa ładowania — PASS.
- Offline miks muzyki i warstwy tęczy, mega clasha, siedmiu zapłonów oraz ośmiu
  par clang/thud(2): peak 0,9373, RMS 0,0926, zero przesterowanych próbek.
- Chrome / Apple M4 / ANGLE Metal: shader linked, zero błędów JS, szarża,
  trzy tęcze i wypalenie. Z nagrywaniem: mediana 16,7 ms, p95 17,4 ms,
  119 próbek. Obejrzano widok po wypaleniu z drobnym brokatem.
- Skrócona kamera daje te same macierze (tolerancja 1e-12); generator pudełek
  zachowuje płaszczyzny, narożniki i normalne wszystkich sześciu ścian.
  Winding może być inny; renderer nie włącza face culling.

## Paczka F21

`fireball:verify`: PASS, trzy uruchomienia końcowego ZIP-a. Produkcyjny HTML
przeszedł też test GPU, desktop/pion/poziom i start dotykiem w Chrome.
Bez błędów JS; rozmiary telefonu emulowane, bez fizycznego urządzenia.

ZIP **13 275 / 13 312 bajtów**, zapas **37**. Pięć kompresji O2:
13 294, 13 275, 13 300, 13 297, 13 294 — wszystkie mieszczą się w limicie.
HTML w ZIP-ie i play/unicorn-fireball.html są identyczne.

SHA-256 ZIP: `1c8a386a276c9ce809f21cf386ad1328efcf48fddb7505d41d78aeef9c1654f2`.

## Poprzednia runda — F20

# Unicorn Fireball — QA F20, 2026-09-06

## Wyładowania, uderzenia i halo

- Usunięto górny punkt wyładowań: przy każdym poziomie ładowania łuk łączy
  dwa różne unicorny na wysokości 0,9, zamiast uciekać nad środek stada.
- Zwykły pierwszy kontakt z podwładnym emituje teraz zdarzenie horn,
  wcześniej odgłos dotyczył tylko liderów lub późniejszego wywrócenia.
- Zdarzenie blast odtwarza mocniejszy szum uderzenia i opadający bas.
  Wywrócenia w jednej klatce współdzielą jeden dźwięk; tęcza ma priorytet
  i dwukrotny gain względem zwykłego wywrócenia.
- Bazowa alpha halo wzrosła z .06 do .1; pulsowanie i zanik blisko kamery
  pozostają. Nie zmieniono pozycji duszków ani reguł obrażeń.

## Sprawdzenie

23 testy reguł PASS, w tym pierwsze ogłuszenie podwładnego z feedbackiem.
Testy rzeczywistych bloków renderera PASS: końce łuku przy pełnym ładowaniu,
grupowanie 30 trafień tęczą do jednego mocniejszego dźwięku i cienie.
OfflineAudioContext: miks muzyki, mega clasha, zapłonu oraz ośmiu par
clang/thud(2): peak 0,7912, RMS 0,0650, zero próbek poza pełną skalą.
To kontrola miksera, nie subiektywna ocena na głośnikach telefonu.

Chrome / Apple M4 / ANGLE Metal: shader linked, zero błędów JS; szarża
na zakręcie, trzy tęcze, wypalenie. Z nagrywaniem: mediana klatki 16,7 ms,
p95 17,4 ms (119 próbek). Obejrzano obrazy szarży i trzech tęcz.
Test przeglądarkowy wykrył i pozwolił usunąć konflikt nazwy lokalnego
agregatora dźwięków ze stanem kamery mega clasha przed końcowym buildem.

## Paczka F20

`npm run fireball:verify`: PASS — trzy uruchomienia końcowego ZIP-a.
Produkcyjny HTML: shader na GPU, desktop/pion/poziom i start dotykiem PASS,
zero błędów JS. Rozmiary telefonu emulowane, bez fizycznego urządzenia.

ZIP **13 273 / 13 312 bajtów**, zapas **39**. Pięć kompresji O2:
13 273, 13 288, 13 281, 13 292, 13 275; wszystkie mieszczą się w limicie.
HTML w ZIP-ie, build/fireball/index.html i play/unicorn-fireball.html są identyczne.

SHA-256 ZIP: `9cc20cddd0798c7039c08153414be1b0ac4d01ee868b68747ee762418e83f608`.

## Poprzednia runda — F19

# Unicorn Fireball — QA F19, 2026-09-06

## Żywa plazma

Duszki mają pulsujący środek i cztery kolorowe płaty światła; tylne płaty
falują z przesunięciem fazy, dając ogon o długości do trzech jednostek.
Pozycja rdzenia X/Z nadal odpowiada unicornowi. Łuki elektryczne podczas
zapłonu łączą członków bandy. Promień tęczy oddycha o 6%, a lokalne krótkie
rozjaśnienia przemieszczają się po jej pasach. Zachowano półczubek przy
liderze i światło rozlane po podłożu. Nie dodano tekstur ani osobnego jądra.

## Kilka źródeł światła

Każda pobliska zapalona tęcza wnosi wagę `max(0, 1 - dystans/(4*promień))`.
Wektory kierunków sumują się; wynik normalizuje `1 + suma wag`. Tą samą
wartością dzielona jest alpha cienia. Dwa przeciwne równe światła skracają
wydłużenie do zera i rozjaśniają cień. Przy wygaśnięciu źródeł wraca zwykły
cień kontaktowy. Nie ma wybierania pierwszej tęczy ani przeskoku przy
przestawieniu listy świateł.

To jeden płynny, uproszczony cień, nie kilka fizycznych cieni ani shadow map.
Bryły unicornów wciąż mają bazowe oświetlenie; dynamiczna poświata oświetla
ziemię. Bardzo bliskie skupiska duszków mogą nadal nasycać biel.

## Sprawdzenie

- 22 testy reguł: PASS; symulacja herd.js i protokół net.js bez zmian.
- Test rzeczywistego bloku cieni z renderera: kierunki, przeciwne światła,
  kolejność źródeł i wygaśnięcie — PASS. Zapisany jako
  `tools/test-fireball-plasma.mjs`, dołączony do `fireball:test`.
- Zwykły Chrome / Apple M4 / ANGLE Metal: shader linked, zero błędów JS,
  szarża na zakręcie, trzy jednoczesne tęcze i powrót po wypaleniu.
- Przy trzech tęczach i nagrywaniu wideo: mediana odstępu klatek 16,7 ms,
  p95 17,6 ms, 119 próbek. To krótki pomiar na M4, nie benchmark telefonów.
- Pakowanie: skrócone nazwy GLSL, krótszy układ strony dla canvas-only,
  pomijanie meta charset tylko przy wyłącznie ASCII w całym dokumencie.
  Test Unicode tytułu potwierdza zachowanie deklaracji UTF-8, gdy jest potrzebna.

- Zmiana układu wykryła 4 px nadmiaru wysokości canvasu; `display:block`
  usunęło odstęp linii. Granice canvasu i start dotykiem sprawdzono przy
  960×540, 390×844 i 844×390 w Chrome. To emulacja rozmiarów, nie fizyczny telefon.

## Paczka F19

`npm run fireball:verify`: PASS — trzy uruchomienia końcowego ZIP-a.
Dokładnie końcowy HTML przeszedł też test GPU, rozmiarów ekranu i startu
dotykiem w Chrome, bez błędów JS.

ZIP **13 295 / 13 312 bajtów**, zapas **17**. Pięć kompresji O2:
13 305, 13 304, 13 295, 13 311, 13 308. Wszystkie mieszczą się w limicie,
choć największa ma tylko 1 bajt zapasu. HTML w ZIP-ie jest identyczny z
`build/fireball/index.html` i `play/unicorn-fireball.html`.

SHA-256 ZIP: `e6f143f35e8b750a6a89d13235636e5430cef6eb112157d6afd150bc2c086117`.

## Poprzednia runda — F18


## Światło, cień i półczubek

Ostatni aktywny segment tęczy zwęża się do łuku o promieniu bazowym 0,8
przy duszku lidera. Historia śladu pozostaje na trasie środka bandy.
Symulacja i pozycje duszków są identyczne z F16; lokalną zmianę podążania
wycofano. To wyłącznie połączenie i zwężenie renderowanego efektu.

Poświata jest rysowana poziomo nad ziemią, przed cieniami i unicornami.
Zasięg wynosi czterokrotność promienia bandy, z miękkim zanikiem. W tym
zasięgu płaski cień unicorna wydłuża się w kierunku od płonącej bandy.
Ograniczenia: uproszczony prostokątny cień, bez shadow map i bez dynamicznego
oświetlenia bryły unicorna. Przy wielu źródłach cień wybiera pierwszą
pobliską płonącą bandę z listy. Nie symuluje cieni rzucanych przez samą tęczę.

Zmniejszono alpha pasów z 0,38 do 0,16, by ograniczyć nasycanie bieli i
pokazać zwężenie. Środek plazmy nadal może być biały. Budżet pochodzi ze
skrócenia dodatkowych prywatnych nazw, usunięcia 3-procentowego falowania
promienia łuku i jego nieużywanego parametru oraz uproszczenia uploadu
trzech dynamicznych buforów: wszystkie są Float32Array i zawsze mają
jawny count. Nie zmieniano protokołu sieciowego ani mechaniki walki.

Widoki z przodu, z boku i zza gracza przy prędkości 37 sprawdzono w zwykłym
Google Chrome na Apple M4 / ANGLE Metal, bez SwiftShader i bez błędów JS.

Sprawdzono również wyłączenie zapłonu w tej samej scenie: poświata ziemi
i kierunkowy cień znikają, pozostaje zwykły cień pod stopami oraz gasnący ślad.

## Paczka F18

`npm run fireball:verify`: PASS — trzy uruchomienia końcowego ZIP-a.

ZIP **13 271 / 13 312 bajtów**, zapas **41**. Pięć kompresji O2:
13 271, 13 274, 13 277, 13 275, 13 274. Wszystkie mieszczą się w limicie.
HTML w ZIP-ie jest identyczny z `build/fireball/index.html` i
`play/unicorn-fireball.html`.

SHA-256 ZIP: `5fd5c35464255802a092b3a0972e691d1c5111da3856948e80715734d5f0e957`.

## Poprzednia runda — F16

## Plazmowe duszki zamiast osobnego jądra

Zapłon zamienia każdego aktywnego unicorna w duszka w jego rzeczywistej
pozycji: poświata w kolorze bandy, jasny środek i krótki ogon za kierunkiem
ruchu. Nakładające się poświaty tworzą skupiska plazmy. Osobnego jądra nie ma.
Duszki unoszą się nisko (0,35–0,65 nad ziemią); dolną część ucina podłoże.
Efekt przypomina łączenie metaballi, ale nie używa progowania pola ani
nowego shadera. To nakładanie światła; z bliska duże skupiska nasycają biel.

Duszki korzystają z dotychczasowej symulacji podążania za liderem. Wypalenie
przywraca modele w aktualnych pozycjach. Wywrócone unicorny nie znikają:
ukrywane są tylko aktywne jednostki, które dostają plazmową reprezentację.
Sprawdzono sceny 35+ z przodu, z boku i zza gracza, również w ruchu,
w Chromium/SwiftShader. Brak błędów JavaScript. Bez zmian reguł walki.
Dodatkowo wykonano screenshoty w zwykłym oknie Google Chrome, z rendererem
`ANGLE Metal Renderer: Apple M4`, bez SwiftShader. Kontrolowane stado 33–35
leciało z prędkością 37; sprawdzono kamerę gracza, bok i przód. Brak błędów JS.
Pozostały problem wizualny: w pełnym ruchu nakładanie tęczowych pasów mocno
nasyca biel i zasłania duszki również na GPU. Duszki mają krótkie ogonki,
nie indywidualne smugi zapamiętujące tor lotu; długi ślad należy do tęczy.

Test pierwszej rozgrywki przeszedł: zapłon po 5,17 s z czterema
podwładnymi i pełnym zdrowiem; sterowanie aż do naturalnego wypalenia.

Zapłon dostał narastający sweep 180 → 3200 Hz przez 0,45 s oraz krótki szum.
Offline test miksu walki: peak 0,438, RMS 0,053, zero przesterowanych próbek.
Test nie zastępuje odsłuchu na rzeczywistych głośnikach.
Wyniki szerokiego QA i balansu F15 poniżej pozostają historyczne.

## Paczka F16

`npm run fireball:verify`: PASS — trzy uruchomienia końcowego ZIP-a.

ZIP **13 280 / 13 312 bajtów**, zapas **32**. Pięć kompresji O2:
13 287, 13 289, 13 280, 13 291, 13 283. Wszystkie mieszczą się w limicie.
HTML w ZIP-ie jest identyczny z `build/fireball/index.html` i
`play/unicorn-fireball.html`.

SHA-256 ZIP: `2881ed1d47b57e9b9aa4d734e258a23436e79a756fb53385d99bc38b283a7768`.

## Poprzednia runda QA — F15


## Zmieniona mechanika

Zwykłe taranowanie działa lokalnie: upadają unicorny w obszarze tęczy.
Trafienie lidera zabiera mu serce, ale nie rozrzuca odległych podwładnych.
Czołowa eksplozja nadal może rozbić całe przegrane stado.

Kolizja dwóch tęcz używa kierunku od środka jednej bandy do drugiej oraz
rzeczywistej prędkości zbliżania. Rozchodzące się bandy nie dostają kolejnego
impulsu. Eksplozja wymaga, by obie bandy były zwrócone przodem do miejsca
kontaktu (iloczyny kierunku i normalnej kontaktu co najmniej 0,65).
Samo przeciwne ustawienie kierunków przy bocznym otarciu nie wystarcza.

Przy bocznym kontakcie impuls wynosi:
`1.5 * closingSpeed / (1/massA + 1/massB)`, gdzie masa to podwładni + lider.
To odpowiednik zderzenia ze współczynnikiem restytucji 0,5: pęd wzdłuż
normalnej jest wymieniany, mniejsza banda reaguje mocniej. Zmieniane są
prędkości i kierunki obu tęcz; obie nadal płoną, bez utraty serc. Zachowano
0,6 s ochrony przed ponownym kontaktem. To model zręcznościowy dla okrągłych
obszarów kolizji, a nie dokładna fizyka brył każdego unicorna.

Zapalonej tęczy nie można anulować puszczeniem przycisku ani hamulcem.
Można skręcać. Tęcza kończy się po wypaleniu, czołowym clashu lub eliminacji.
Przed zapłonem puszczenie przerywa ładowanie, a hamulec nadal zatrzymuje bandę.
Niestabilność dużej bandy też prowadzi do nieanulowalnego zapłonu — trzeba
ją chłodzić wcześniej. Menu i pasek tęczy pokazują NO BRAKES; przy krawędzi
płonący gracz dostaje STEER NOW, a zwykły BRAKE & TURN.

Aby blokada nie oznaczała nieuniknionej śmierci, zwiększono sterowność przy
wysokim ładowaniu (mnożnik 1 - 0,4*charge zamiast 1 - 0,6*charge), pozostawiając
bezwładność zależną od liczebności. AI przewiduje granicę wcześniej podczas
płonięcia. Nie dodano automatycznej ochrony przed wypadnięciem.

## Dowody z testów reguł

22 testy obejmują między innymi:

- trafienie lidera i bliskiego podwładnego bez wywrócenia odległego;
- zachowanie pędu przy kontakcie bocznym oraz brak obrażeń i eksplozji;
- silniejsze odchylenie dla szybszego lub cięższego napastnika;
- przeciwne kierunki z kontaktem bocznym jako otarcie, nie eksplozję;
- brak ponownego impulsu dla rozchodzących się tęcz;
- nieanulowalny zapłon, naturalne wypalenie i późniejszy cooldown;
- bandę 10 uderzającą z boku w bandę 35 przy granicy: większa wypada mimo
  hamowania; w kontrolnym przebiegu bez uderzenia jej równoległa trasa jest bezpieczna;
- poprzednie regresje zbierania, NaN, pościgu, wyniku i uwalniania podwładnych.

## Balans

Walidacja końcowej fizyki, seedy 33–96, 64 rundy AI przy 30 krokach/s,
limit 420 s. Porównanie z F14 z poprzedniej rundy:

| Pomiar | F14 | F15 |
|---|---:|---:|
| Zakończone rundy | 64/64 | 64/64 |
| Średni czas | 84,9 s | 91,9 s |
| Mega clashe dwóch band 30+ | 1 | 2 |
| Wszystkie czołowe clashe | 77 | 97 |
| Największe stado | 57 | 55 |
| Wygrane mniej licznej bandy w ostatnim nierównym pojedynku | 6/61 | 9/63 |
| Śmierci na krawędzi / NaN | 0 / 0 | 0 / 0 |

`node tools/probe-fireball-balance.mjs --start=33 --count=64` odtwarza wynik.
Mega clashe: seedy 68 i 73. Małe różnice arytmetyki zmiennoprzecinkowej
mogą zmieniać przebieg długiej symulacji; tabela dotyczy końcowej wersji.

Wstępny zestaw 32 rund prototypu zakończył wszystkie rundy, z jednym upadkiem
na krawędzi. W losowym teście przeglądarkowym 24/24 rund się zakończyło, ale
pierwszy bot nie wygrał żadnej. Test dystrybucji korzystał z losowości także
zużywanej przez wcześniejsze renderowanie; ustalono seedy regresji zamiast
powtarzać losowania do uzyskania sukcesu. To nie zastępuje oceny balansu:
końcowa próba 64 seedów daje pierwszemu botowi 6 zwycięstw.
Ustalony zestaw przeglądarkowy zakończył 24/24 rund, z 4 wygranymi pierwszego
bota i średnim czasem 97 s. Testy sterowania, multiplayera, końca gry, audio
i pierwszej rozgrywki przeszły. Przy pierwszym zapłonie po około 5 s gracz
miał pełne zdrowie i przetrwał prowadzenie tęczy do wypalenia.

## Ograniczenia

Model nagradza celowanie w lidera, ataki boczne i przygotowanie toru szarży.
Nie dowiedziono jeszcze, że początkujący gracze odczytają te możliwości.
Wypychanie poza granicę sprawdzono w kontrolowanej scenie, nie jako częstość
wygrywającej taktyki ludzi. Duże clashe nadal są rzadkie; nie są wymuszane.

Chromium/SwiftShader i lokalny relay, bez fizycznego telefonu, Safari,
Firefoxa i publicznego relaya. Stan solo po śmierci nadal zatrzymuje grę.

## Paczka F15 (historyczna)

`npm run fireball:verify`: PASS — trzy uruchomienia końcowego ZIP-a.

ZIP **13 282 / 13 312 bajtów**, zapas **30**. Pięć kompresji O2:
13 282, 13 289, 13 289, 13 298, 13 297. Wszystkie mieszczą się w limicie.
O1 nie wystarczało; skrypty Fireball używają teraz O2. Oprócz kompresji
usunięto redundantne sprawdzanie trybu obserwatora w warunkach online HUD-u.
HTML w ZIP-ie jest identyczny z `build/fireball/index.html` i
`play/unicorn-fireball.html`.

SHA-256: `487c5bee59c274e54166d0705d5b9f04517ecd79b0a0c397587aaac65479197e`.
