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
